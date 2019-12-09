// +build !docker

package main

import (
	"fmt"
	"os"
	"testing"
)

func TestTaskclusterProxy(t *testing.T) {
	defer setup(t)()

	taskID := CreateArtifactFromFile(t, "SampleArtifacts/_/X.txt", "SampleArtifacts/_/X.txt")

	payload := GenericWorkerPayload{
		Command: append(
			append(
				goEnv(),
				// long enough to reclaim and get new credentials
				sleep(12)...,
			),
			goRun(
				"curlget.go",
				// note that curlget.go supports substituting the proxy URL from its runtime environment
				fmt.Sprintf("TASKCLUSTER_PROXY_URL/queue/v1/task/"+taskID+"/runs/0/artifacts/SampleArtifacts/_/X.txt"),
			)...,
		),
		MaxRunTime: 180,
		Env:        map[string]string{},
		Features: FeatureFlags{
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
	td.Dependencies = []string{taskID}
	reclaimEvery5Seconds = true
	taskID = submitAndAssert(t, td, payload, "completed", "completed")
	reclaimEvery5Seconds = false

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
