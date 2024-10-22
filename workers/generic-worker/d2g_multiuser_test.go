//go:build multiuser

package main

import (
	"encoding/json"
	"fmt"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v73/tools/d2g/dockerworker"
)

func TestD2GWithChainOfTrust(t *testing.T) {
	setup(t)
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{"/bin/bash", "-c", "echo hello"},
		Image:   json.RawMessage(`"denolehov/curl"`),
		Features: dockerworker.FeatureFlags{
			ChainOfTrust: true,
		},
		MaxRunTime: 10,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	switch fmt.Sprintf("%s:%v", runtime.GOOS, config.RunTasksAsCurrentUser) {
	case "linux:false":
		taskID := submitAndAssert(t, td, payload, "completed", "completed")
		cotUnsignedBytes := getArtifactContent(t, taskID, "public/chain-of-trust.json")
		var cotCert ChainOfTrustData
		err := json.Unmarshal(cotUnsignedBytes, &cotCert)
		if err != nil {
			t.Fatalf("Could not unmarshal public/chain-of-trust.json into go type ChainOfTrustData: %v", err)
		}
		cotCertTaskPayload := new(dockerworker.DockerWorkerPayload)
		defaults.SetDefaults(cotCertTaskPayload)
		err = json.Unmarshal(cotCert.Task.Payload, &cotCertTaskPayload)
		if err != nil {
			t.Fatalf("Could not unmarshal chain-of-trust.json field task.payload into go type dockerworker.DockerWorkerPayload: %v", err)
		}
		if !reflect.DeepEqual(*cotCertTaskPayload, payload) {
			t.Fatalf("Expected chain of trust cert task payload to match original docker worker payload...\nOriginal:\n%#v\nChain of trust version:\n%#v", payload, cotCertTaskPayload)
		}
		if !reflect.DeepEqual(cotCert.Task.Scopes, td.Scopes) {
			t.Fatalf("Expected chain of trust cert task scopes to match original docker worker scopes...\nOriginal:\n%#v\nChain of trust version:\n%#v", cotCert.Task.Scopes, td.Scopes)
		}
	default:
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	}
	t.Log(LogText(t))
}

func TestD2GWithIncorrectKVMScopes(t *testing.T) {
	setup(t)
	payload := dockerworker.DockerWorkerPayload{
		Command: []string{"/bin/bash", "-c", "echo hello"},
		Image:   json.RawMessage(`"denolehov/curl"`),
		Capabilities: dockerworker.Capabilities{
			Devices: dockerworker.Devices{
				KVM: true,
			},
		},
		MaxRunTime: 10,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	// don't set KVM toggle scopes, eg: generic-worker:capability:device:kvm
	// we need the below scopes added for the os groups feature to
	// complete successfully, to properly then check that the KVM feature
	// fails the required scopes check
	td.Scopes = append(
		td.Scopes,
		"generic-worker:os-group:"+td.ProvisionerID+"/"+td.WorkerType+"/kvm",
		"generic-worker:os-group:"+td.ProvisionerID+"/"+td.WorkerType+"/libvirt",
	)

	switch runtime.GOOS {
	case "linux":
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

		logtext := LogText(t)
		if !strings.Contains(logtext, "generic-worker:capability:device:kvm:"+td.ProvisionerID+"/"+td.WorkerType) || !strings.Contains(logtext, "generic-worker:capability:device:kvm") {
			t.Fatal("Expected log file to contain missing scopes, but it didn't")
		}
	default:
		_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")
	}

	t.Log(LogText(t))
}
