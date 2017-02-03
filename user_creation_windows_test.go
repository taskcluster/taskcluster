package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunAfterUserCreation(t *testing.T) {
	setup(t)
	if config.RunTasksAsCurrentUser {
		t.Skip("Skipping since running as current user...")
	}
	config.RunAfterUserCreation = filepath.Join(cwd, "testdata", "run-after-user.bat")
	PrepareTaskEnvironment()
	defer taskCleanup()
	file := filepath.Join(taskContext.TaskDir, "run-after-user.txt")
	_, err := os.Stat(file)
	if err != nil {
		t.Fatal("Got error when looking for file %v: %v", file, err)
	}
}
