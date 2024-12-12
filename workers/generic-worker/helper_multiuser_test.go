//go:build multiuser

package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/taskcluster/taskcluster/v76/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v76/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v76/workers/generic-worker/process"
)

func expectChainOfTrustKeyNotSecureMessage(t *testing.T, td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload) {
	t.Helper()
	taskID := submitAndAssert(t, td, payload, "exception", "malformed-payload")

	expectedArtifacts := ExpectedArtifacts{
		"public/logs/live_backing.log": {
			Extracts: []string{
				ChainOfTrustKeyNotSecureMessage,
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
		},
		"public/logs/live.log": {
			Extracts: []string{
				ChainOfTrustKeyNotSecureMessage,
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
		},
	}

	expectedArtifacts.Validate(t, taskID, 0)
}

func engineTestSetup(t *testing.T, testConfig *gwconfig.Config) {
	t.Helper()
	runningTests = true
	testConfig.HeadlessTasks = true
	testConfig.RunTasksAsCurrentUser = os.Getenv("GW_TESTS_RUN_AS_CURRENT_USER") != ""
	// Needed for tests that don't call RunWorker()
	// but test methods/functions directly
	taskUserCredentials, err := StoredUserCredentials(filepath.Join(cwd, "next-task-user.json"))
	if err != nil {
		t.Fatalf("Could not fetch task user credentials: %v", err)
	}
	pd, err := process.NewPlatformData(testConfig.RunTasksAsCurrentUser, testConfig.HeadlessTasks, taskUserCredentials)
	if err != nil {
		t.Fatalf("Could not create platform data: %v", err)
	}
	taskContext = &TaskContext{
		User:    taskUserCredentials,
		pd:      pd,
		TaskDir: testdataDir,
	}
}
