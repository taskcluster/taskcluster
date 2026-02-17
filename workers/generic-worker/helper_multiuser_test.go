//go:build multiuser

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/gwconfig"
	gwruntime "github.com/taskcluster/taskcluster/v96/workers/generic-worker/runtime"
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
	// macOS CI tests do not run in headless in order to exercise the launch agent as much as possible
	testConfig.HeadlessTasks = (runtime.GOOS != "darwin")
	testConfig.EnableRunTaskAsCurrentUser = true
	testConfig.EnableD2G(t)

	// Set runningTests for both paths so the worker updates global taskContext
	runningTests = true

	if os.Getenv("GW_IN_DOCKER") == "1" {
		// In Docker, exercise the real headless user creation path.
		// CreateTaskContext will see GW_IN_DOCKER and skip the next-task-user.json shortcut.
		// Create a temporary user for tests that directly access taskContext
		// without going through RunWorker().
		taskDirName := fmt.Sprintf("task_%d", time.Now().UnixNano())
		if len(taskDirName) > 20 {
			taskDirName = taskDirName[:20]
		}
		taskUser := &gwruntime.OSUser{
			Name:     taskDirName,
			Password: gwruntime.GeneratePassword(),
		}
		err := taskUser.CreateNew(false)
		if err != nil {
			t.Fatalf("Could not create test user: %v", err)
		}
		taskContext = &TaskContext{
			User:    taskUser,
			TaskDir: testdataDir,
		}
		return
	}

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
