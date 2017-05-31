package main

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster-client-go"
)

// Makes sure that if a running task gets cancelled externally, the worker does not shut down
func TestResolveResolvedTask(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
		Command:    goRun("resolvetask.go"),
		MaxRunTime: 60,
		Artifacts: []struct {
			Expires tcclient.Time `json:"expires,omitempty"`
			Name    string        `json:"name,omitempty"`
			Path    string        `json:"path"`
			Type    string        `json:"type"`
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
	td := testTask()
	tempCreds, err := fullCreds.CreateNamedTemporaryCredentials("project/taskcluster:generic-worker-tester/TestResolveResolvedTask", time.Minute, "queue:cancel-task:"+td.SchedulerID+"/"+td.TaskGroupID+"/*")
	if err != nil {
		t.Fatalf("%v", err)
	}
	env := map[string]string{
		"TASKCLUSTER_CLIENT_ID":    tempCreds.ClientID,
		"TASKCLUSTER_ACCESS_TOKEN": tempCreds.AccessToken,
		"TASKCLUSTER_CERTIFICATE":  tempCreds.Certificate,
	}
	jsonBytes, err := json.Marshal(&env)
	if err != nil {
		t.Fatalf("%v", err)
	}
	var envRawMessage json.RawMessage
	err = json.Unmarshal(jsonBytes, &envRawMessage)
	if err != nil {
		t.Fatalf("%v", err)
	}
	payload.Env = envRawMessage

	_, _ = executeTask(t, td, payload)
}
