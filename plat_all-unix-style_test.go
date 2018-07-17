// +build !windows

package main

import "testing"

func TestSeparateTaskUsersNotSupported(t *testing.T) {
	defer setup(t)()
	config.RunTasksAsCurrentUser = false
	exitCode := RunWorker()
	if exitCode != INVALID_CONFIG {
		t.Fatalf("Got exit code %v but was expecting exit code %v", exitCode, INVALID_CONFIG)
	}
}
