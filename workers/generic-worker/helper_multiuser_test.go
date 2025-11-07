//go:build multiuser

package main

import (
	"path/filepath"
	"runtime"
	"testing"

	"github.com/taskcluster/taskcluster/v93/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v93/workers/generic-worker/gwconfig"
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
	// macOS CI tests to not run in headless in order to exercise the launch agent as much as possible
	testConfig.HeadlessTasks = (runtime.GOOS != "darwin")
	testConfig.EnableRunTaskAsCurrentUser = true
	testConfig.EnableD2G(t)
	// Needed for tests that don't call RunWorker()
	// but test methods/functions directly
	taskUserCredentials, err := StoredUserCredentials(filepath.Join(cwd, "next-task-user.json"))
	if err != nil {
		t.Fatalf("Could not fetch task user credentials: %v", err)
	}
	taskContext = &TaskContext{
		User:    taskUserCredentials,
		TaskDir: testdataDir,
	}
}
