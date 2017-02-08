package main

import "testing"

// Test APPDATA / LOCALAPPDATA folder are not shared between tasks
func TestAppDataNotShared(t *testing.T) {
	setup(t)

	if config.RunTasksAsCurrentUser {
		t.Skip("Not running, since APPDATA does not change when running as current user")
	}

	// Run two tasks in sequence...

	// First task:
	payload1 := GenericWorkerPayload{
		Command: []string{
			"echo hello > %APPDATA%\\hello.txt",
			"echo hello > %LOCALAPPDATA%\\sir.txt",
			`if not exist "%APPDATA%\hello.txt" exit /b 64`,
			`if not exist "%LOCALAPPDATA%\sir.txt" exit /b 65`,
		},
		MaxRunTime: 10,
	}
	td1 := testTask()

	taskID1, myQueue := submitTask(t, td1, payload1)

	// Second task:
	payload2 := GenericWorkerPayload{
		Command: []string{
			// make sure files don't already exist, because we should have
			// fresh folders created
			`if exist "%APPDATA%\hello.txt" exit /b 66`,
			`if exist "%LOCALAPPDATA%\sir.txt" exit /b 67`,
		},
		MaxRunTime: 10,
	}
	td2 := testTask()

	taskID2, _ := submitTask(t, td2, payload2)

	config.NumberOfTasksToRun = 2
	runWorker()

	// make sure both tasks resolved successfully
	for _, taskID := range []string{taskID1, taskID2} {
		tsr, err := myQueue.Status(taskID)
		if err != nil {
			t.Fatalf("Could not retrieve task status")
		}
		if tsr.Status.State != "completed" {
			t.Fatalf("Was expecting state %q but got %q", "completed", tsr.Status.State)
		}
	}
}
