// +build !docker

package main

import (
	"encoding/base64"
	"os"
	"testing"
)

func TestTaskclusterProxy(t *testing.T) {

	defer setup(t)()

	taskID := CreateArtifactFromFile(t, "SampleArtifacts/_/X.txt", "SampleArtifacts/_/X.txt")

	// We base64 encode the url, because I can't get to the bottom of the
	// windows command escaping issues, so I haven't worked out how to
	// correctly escape the URL in the batch script that is generated from the
	// command. Base64 encoded strings don't require any batch script escaping,
	// so this is a cheap solution to the problem.
	base64EncodedURL := base64.StdEncoding.EncodeToString(
		// note that curlget.go substitutes the literal TASKCLUSTER_PROXY_URL
		// with the actual value of the environment variable in its environment
		[]byte("TASKCLUSTER_PROXY_URL/queue/v1/task/" + taskID + "/artifacts/SampleArtifacts%2F_%2FX.txt"),
	)

	payload := GenericWorkerPayload{
		Command: append(
			append(
				GoEnv(),
				// long enough to reclaim and get new credentials
				sleep(12)...,
			),
			goRun(
				"curlget.go",
				base64EncodedURL,
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
