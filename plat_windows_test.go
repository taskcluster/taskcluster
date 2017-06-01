package main

import "testing"

// Test APPDATA / LOCALAPPDATA folder are not shared between tasks
func TestAppDataNotShared(t *testing.T) {

	t.Skip("It isn't possible to test this without rebooting, which we can't do in the middle of a test, so disabling")

	setup(t)
	defer teardown(t)

	if config.RunTasksAsCurrentUser {
		t.Skip("Not running, since APPDATA does not change when running as current user")
	}

	// Run two tasks in sequence...

	// First task:
	payload1 := GenericWorkerPayload{
		Command: []string{
			// make sure vars are set
			// https://bugzilla.mozilla.org/show_bug.cgi?id=1338602
			`if not defined APPDATA exit /b 68`,
			`if not defined LOCALAPPDATA exit /b 69`,
			"echo hello > %APPDATA%\\hello.txt",
			"echo hello > %LOCALAPPDATA%\\sir.txt",
			`if not exist "%APPDATA%\hello.txt" exit /b 64`,
			`if not exist "%LOCALAPPDATA%\sir.txt" exit /b 65`,
		},
		MaxRunTime: 10,
	}
	td1 := testTask(t)

	taskID1, myQueue := executeTask(t, td1, payload1)

	// Second task:
	payload2 := GenericWorkerPayload{
		Command: []string{
			// make sure vars are set
			// https://bugzilla.mozilla.org/show_bug.cgi?id=1338602
			`if not defined APPDATA exit /b 70`,
			`if not defined LOCALAPPDATA exit /b 71`,
			// make sure files don't already exist, because we should have
			// fresh folders created
			`if exist "%APPDATA%\hello.txt" exit /b 66`,
			`if exist "%LOCALAPPDATA%\sir.txt" exit /b 67`,
		},
		MaxRunTime: 10,
	}
	td2 := testTask(t)

	taskID2, _ := executeTask(t, td2, payload2)

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

// Test we don't get weird error:
//  c:\mozilla-build\msys\bin\bash.exe: *** CreateFileMappingA, Win32 error 0.  Terminating.
func TestNoCreateFileMappingError(t *testing.T) {
	setup(t)
	defer teardown(t)

	if config.RunTasksAsCurrentUser {
		t.Skip("Not running, since we never want to call msys directly from LocalSystem account")
	}

	payload := GenericWorkerPayload{
		// run several bash commands, as running one is horribly slow, but
		// let's make sure if you run a lot of them, they are not all slow -
		// hopefully just the first one is the problem
		Command: []string{
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
			`c:\mozilla-build\msys\bin\bash.exe -c "echo hello"`,
		},
		MaxRunTime: 120,
	}
	td := testTask(t)

	taskID, myQueue := executeTask(t, td, payload)

	// make sure task resolved successfully
	tsr, err := myQueue.Status(taskID)
	if err != nil {
		t.Fatalf("Could not retrieve task status")
	}
	if tsr.Status.State != "completed" {
		t.Fatalf("Was expecting state %q but got %q", "completed", tsr.Status.State)
	}
}
