package main

import (
	"fmt"
	"os"
	"testing"
)

func TestTaskclusterProxy(t *testing.T) {
	setup(t, "TestTaskclusterProxy")
	defer teardown(t)
	payload := GenericWorkerPayload{
		Command: append(
			append(
				goEnv(),
				sleep(12)...,
			),
			goRun(
				"curlget.go",
				fmt.Sprintf("http://localhost:%v/queue/v1/task/KTBKfEgxR5GdfIIREQIvFQ/runs/0/artifacts/SampleArtifacts/_/X.txt", config.TaskclusterProxyPort),
			)...,
		),
		MaxRunTime: 60,
		Env:        map[string]string{},
		Features: struct {
			ChainOfTrust     bool `json:"chainOfTrust,omitempty"`
			TaskclusterProxy bool `json:"taskclusterProxy,omitempty"`
		}{
			TaskclusterProxy: true,
		},
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
	td := testTask(t)
	td.Scopes = []string{"queue:get-artifact:SampleArtifacts/_/X.txt"}
	reclaimOftenMux.Lock()
	reclaimEvery5Seconds = true
	reclaimOftenMux.Unlock()
	taskID := scheduleAndExecute(t, td, payload)
	reclaimOftenMux.Lock()
	reclaimEvery5Seconds = false
	reclaimOftenMux.Unlock()

	ensureResolution(t, taskID, "completed", "completed")

	expectedArtifacts := ExpectedArtifacts{
		"public/logs/live_backing.log": {
			Extracts: []string{
				"test artifact",
				"Successfully refreshed taskcluster-proxy credentials",
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
			Expires:         td.Expires,
		},
	}

	expectedArtifacts.Validate(t, taskID, 0)
}
