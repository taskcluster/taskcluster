package main

import (
	"os"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster-client-go"
)

// Makes sure that if a running task gets cancelled externally, the worker does not shut down
func TestResolveResolvedTask(t *testing.T) {
	setup(t, "TestResolveResolvedTask")
	defer teardown(t)
	payload := GenericWorkerPayload{
		Command:    goRun("resolvetask.go"),
		MaxRunTime: 60,
		Artifacts: []struct {
			ContentType string        `json:"contentType,omitempty"`
			Expires     tcclient.Time `json:"expires,omitempty"`
			Name        string        `json:"name,omitempty"`
			Path        string        `json:"path"`
			Type        string        `json:"type"`
		}{

			{
				Type:    "file",
				Path:    "resolvetask.go",
				Expires: inAnHour,
			},
		},
	}
	fullCreds := &tcclient.Credentials{
		AccessToken: config.AccessToken,
		ClientID:    config.ClientID,
		Certificate: config.Certificate,
	}
	if fullCreds.AccessToken == "" || fullCreds.ClientID == "" || fullCreds.Certificate != "" {
		t.Skip("Skipping TestResolveResolvedTask since I need permanent TC credentials for this test")
	}
	td := testTask(t)
	tempCreds, err := fullCreds.CreateNamedTemporaryCredentials("project/taskcluster:generic-worker-tester/TestResolveResolvedTask", time.Minute, "queue:cancel-task:"+td.SchedulerID+"/"+td.TaskGroupID+"/*")
	if err != nil {
		t.Fatalf("%v", err)
	}
	payload.Env = map[string]string{
		"TASKCLUSTER_CLIENT_ID":    tempCreds.ClientID,
		"TASKCLUSTER_ACCESS_TOKEN": tempCreds.AccessToken,
		"TASKCLUSTER_CERTIFICATE":  tempCreds.Certificate,
	}
	for _, envVar := range []string{
		"PATH",
		"GOPATH",
		"GOROOT",
	} {
		if v, exists := os.LookupEnv(envVar); exists {
			payload.Env[envVar] = v
		}
	}

	taskID := scheduleAndExecute(t, td, payload)

	ensureResolution(t, taskID, "exception", "canceled")
}
