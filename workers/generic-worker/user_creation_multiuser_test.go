// +build multiuser

package main

import (
	"io/ioutil"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRunAfterUserCreation(t *testing.T) {

	// IMPORTANT - see https://bugzil.la/1559210 - this test is independent of
	// whether config.RunTasksAsCurrentUser is true or false.

	defer setup(t)()
	script := "run-after-user.sh"
	if runtime.GOOS == "windows" {
		script = "run-after-user.bat"
	}
	config.RunAfterUserCreation = filepath.Join(testdataDir, script)
	PrepareTaskEnvironment()
	defer func() {
		err := purgeOldTasks()
		if err != nil {
			t.Fatalf("Problem deleting old tasks: %v", err)
		}
	}()
	fileContents, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, "run-after-user.txt"))
	if err != nil {
		t.Fatalf("Got error when looking for file run-after-user.txt: %v", err)
	}
	if !strings.Contains(string(fileContents), "task_") {
		t.Fatalf("Expected runAfterUserCreation script to run as task user - but it ran as %v", string(fileContents))
	}
}
