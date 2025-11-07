//go:build multiuser

package main

import (
	"fmt"
	"runtime"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster/v93/workers/generic-worker/host"
)

func TestMissingScopesOSGroups(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
		Command:    helloGoodbye(),
		MaxRunTime: 30,
		OSGroups:   []string{"abc", "def"},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	// don't set any scopes
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, "generic-worker:os-group:"+td.ProvisionerID+"/"+td.WorkerType+"/abc") || !strings.Contains(logtext, "generic-worker:os-group:"+td.ProvisionerID+"/"+td.WorkerType+"/def") {
		t.Log(logtext)
		t.Fatalf("Was expecting log file to contain missing scopes, but it doesn't")
	}
}

func TestOSGroupsRespected(t *testing.T) {
	setup(t)

	// create some new real OS groups that the test can use
	newGroups := []string{
		slugid.Nice(),
		slugid.Nice(),
	}

	var err error
	for _, newGroup := range newGroups {
		switch runtime.GOOS {
		case "windows":
			err = host.Run("powershell", "-Command", "New-LocalGroup -Name '"+newGroup+"'")
		case "darwin":
			err = host.Run("/usr/sbin/dseditgroup", "-o", "create", newGroup)
		case "freebsd":
			// TODO: copied from Linux, probably needs changing
			err = host.Run("/usr/sbin/groupadd", newGroup)
		case "linux":
			err = host.Run("/usr/sbin/groupadd", newGroup)
		default:
			err = fmt.Errorf("Unsupported platform: %v", runtime.GOOS)
		}
		if err != nil {
			t.Fatal(err)
		}
		defer func(newGroup string) {
			switch runtime.GOOS {
			case "windows":
				err = host.Run("powershell", "-Command", "Remove-LocalGroup -Name '"+newGroup+"'")
			case "darwin":
				err = host.Run("/usr/sbin/dseditgroup", "-o", "delete", newGroup)
			case "freebsd":
				// TODO: copied from Linux, probably needs changing
				err = host.Run("/usr/sbin/groupdel", newGroup)
			case "linux":
				err = host.Run("/usr/sbin/groupdel", newGroup)
			default:
				err = fmt.Errorf("Unsupported platform: %v", runtime.GOOS)
			}
			if err != nil {
				t.Fatal(err)
			}
		}(newGroup)
	}

	payload := GenericWorkerPayload{
		Command:    listGroups(),
		MaxRunTime: 30,
		OSGroups:   newGroups,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	td.Scopes = []string{}
	// grant all required scopes
	for _, group := range payload.OSGroups {
		td.Scopes = append(td.Scopes, "generic-worker:os-group:"+td.ProvisionerID+"/"+td.WorkerType+"/"+group)
	}

	// check task had malformed payload, due to non existent groups
	_ = submitAndAssert(t, td, payload, "completed", "completed")

	logtext := LogText(t)
	for _, group := range payload.OSGroups {
		// On Windows, the built in command to list groups (net localgroup)
		// outputs them prefixed with an asterisk (*). Since it isn't
		// trivial to adapt the Windows task command to not include the
		// asterisk, we've adapted the other platforms to match Windows and
		// include the asterisk. Hence the '*' below.
		substring := "*" + group
		if !strings.Contains(logtext, substring) {
			t.Log(logtext)
			t.Fatalf("Was expecting log to contain string: '%v'", substring)
		}
	}
}

func TestOSGroupsRespectedAsCurrentUser(t *testing.T) {
	setup(t)

	// create some new real OS groups that the test can use
	newGroups := []string{
		slugid.Nice(),
		slugid.Nice(),
	}

	var err error
	for _, newGroup := range newGroups {
		switch runtime.GOOS {
		case "windows":
			err = host.Run("powershell", "-Command", "New-LocalGroup -Name '"+newGroup+"'")
		case "darwin":
			err = host.Run("/usr/sbin/dseditgroup", "-o", "create", newGroup)
		case "freebsd":
			// TODO: copied from Linux, probably needs changing
			err = host.Run("/usr/sbin/groupadd", newGroup)
		case "linux":
			err = host.Run("/usr/sbin/groupadd", newGroup)
		default:
			err = fmt.Errorf("Unsupported platform: %v", runtime.GOOS)
		}
		if err != nil {
			t.Fatal(err)
		}
		defer func(newGroup string) {
			switch runtime.GOOS {
			case "windows":
				err = host.Run("powershell", "-Command", "Remove-LocalGroup -Name '"+newGroup+"'")
			case "darwin":
				err = host.Run("/usr/sbin/dseditgroup", "-o", "delete", newGroup)
			case "freebsd":
				// TODO: copied from Linux, probably needs changing
				err = host.Run("/usr/sbin/groupdel", newGroup)
			case "linux":
				err = host.Run("/usr/sbin/groupdel", newGroup)
			default:
				err = fmt.Errorf("Unsupported platform: %v", runtime.GOOS)
			}
			if err != nil {
				t.Fatal(err)
			}
		}(newGroup)
	}

	payload := GenericWorkerPayload{
		Command:    listGroups(),
		MaxRunTime: 30,
		OSGroups:   newGroups,
		Features: FeatureFlags{
			RunTaskAsCurrentUser: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	td.Scopes = []string{}
	// grant all required scopes
	for _, group := range payload.OSGroups {
		td.Scopes = append(td.Scopes, "generic-worker:os-group:"+td.ProvisionerID+"/"+td.WorkerType+"/"+group)
	}
	td.Scopes = append(td.Scopes,
		"generic-worker:run-task-as-current-user:"+td.ProvisionerID+"/"+td.WorkerType,
	)

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	logtext := LogText(t)
	substring := fmt.Sprintf("Not adding task user to group(s) %v since we are running as current user.", payload.OSGroups)
	if !strings.Contains(logtext, substring) {
		t.Log(logtext)
		t.Fatalf("Was expecting log to contain string: '%v'", substring)
	}
}
