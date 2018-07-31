package main

import (
	"testing"
)

// Test APPDATA / LOCALAPPDATA folder are not shared between tasks
func TestAppDataNotShared(t *testing.T) {

	t.Skip("It isn't possible to test this without rebooting, which we can't do in the middle of a test, so disabling")

	defer setup(t)()

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

	_ = submitAndAssert(t, td1, payload1, "completed", "completed")

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

	_ = submitAndAssert(t, td2, payload2, "completed", "completed")

}

// https://bugzilla.mozilla.org/show_bug.cgi?id=1360539
// Test we don't get weird error:
//  c:\mozilla-build\msys\bin\bash.exe: *** CreateFileMappingA, Win32 error 0.  Terminating.
func TestNoCreateFileMappingError(t *testing.T) {
	defer setup(t)()

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

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

func TestDesktopResizeAndMovePointer(t *testing.T) {
	defer setup(t)()
	if config.RunTasksAsCurrentUser {
		t.Skip("Skipping since running as current user...")
	}
	commands := copyTestdataFile("mouse_and_screen_resolution.py")
	commands = append(commands, copyTestdataFile("machine-configuration.json")...)
	commands = append(commands, "python mouse_and_screen_resolution.py --configuration-file machine-configuration.json")
	payload := GenericWorkerPayload{
		Command:    commands,
		MaxRunTime: 90,
	}
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}
