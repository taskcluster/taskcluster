//go:build multiuser

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	gwruntime "github.com/taskcluster/taskcluster/v100/workers/generic-worker/runtime"
)

func TestRunAfterUserCreation(t *testing.T) {

	// IMPORTANT - see https://bugzil.la/1559210 - this test is independent of
	// whether payload.features.runTaskAsCurrentUser is true or false.

	setup(t)
	script := "run-after-user.sh"
	if runtime.GOOS == "windows" {
		script = "run-after-user.bat"
	}
	config.RunAfterUserCreation = filepath.Join(testdataDir, script)

	// In Docker, create a temporary user; otherwise load from next-task-user.json
	var taskUser *gwruntime.OSUser
	if os.Getenv("GW_IN_DOCKER") == "1" {
		taskDirName := fmt.Sprintf("task_%d", time.Now().UnixNano())
		if len(taskDirName) > 20 {
			taskDirName = taskDirName[:20]
		}
		taskUser = &gwruntime.OSUser{
			Name:     taskDirName,
			Password: gwruntime.GeneratePassword(),
		}
		err := taskUser.CreateNew(false)
		if err != nil {
			t.Fatalf("Could not create test user: %v", err)
		}
	} else {
		var err error
		taskUser, err = StoredUserCredentials(filepath.Join(cwd, "next-task-user.json"))
		if err != nil {
			t.Fatalf("Could not load test user credentials: %v", err)
		}
	}
	ctx := PostRebootSetup(taskUser)

	defer func() {
		err := purgeOldTasks()
		if err != nil {
			t.Fatalf("Problem deleting old tasks: %v", err)
		}
	}()
	fileContents, err := os.ReadFile(filepath.Join(ctx.TaskDir, "run-after-user.txt"))
	if err != nil {
		t.Fatalf("Got error when looking for file run-after-user.txt: %v", err)
	}
	if !strings.Contains(string(fileContents), "task_") {
		t.Fatalf("Expected runAfterUserCreation script to run as task user - but it ran as %v", string(fileContents))
	}
}
