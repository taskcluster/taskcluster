//go:build multiuser

package main

import (
	"os"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v95/clients/client-go/tcqueue"
)

// Test APPDATA / LOCALAPPDATA folder are not shared between tasks
func TestAppDataNotShared(t *testing.T) {

	t.Skip("It isn't possible to test this without rebooting, which we can't do in the middle of a test, so disabling")

	setup(t)

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
	defaults.SetDefaults(&payload1)
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
	defaults.SetDefaults(&payload2)
	td2 := testTask(t)

	_ = submitAndAssert(t, td2, payload2, "completed", "completed")

}

// https://bugzilla.mozilla.org/show_bug.cgi?id=1360539
// Test we don't get weird error:
//
//	c:\cygwin\bin\bash.exe: *** CreateFileMappingA, Win32 error 0.  Terminating.
func TestNoCreateFileMappingError(t *testing.T) {
	if os.Getenv("GW_SKIP_MOZILLA_BUILD_TESTS") != "" {
		t.Skip("Skipping since GW_SKIP_MOZILLA_BUILD_TESTS env var is set")
	}
	setup(t)

	payload := GenericWorkerPayload{
		// run several bash commands, as running one is horribly slow, but
		// let's make sure if you run a lot of them, they are not all slow -
		// hopefully just the first one is the problem
		Command: []string{
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
			`c:\cygwin\bin\bash.exe -c "echo hello"`,
		},
		MaxRunTime: 120,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

func TestDesktopResizeAndMovePointer(t *testing.T) {
	if os.Getenv("GW_SKIP_PYTHON_TESTS") != "" {
		t.Skip("Skipping since GW_SKIP_PYTHON_TESTS env var is set")
	}

	// We run the same test under both headless and non-headless mode, but
	// expect different results. So pull it out into its own function...
	f := func(t *testing.T, headless bool) (td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload) {
		t.Helper()
		setup(t)
		config.HeadlessTasks = headless
		commands := copyTestdataFile("mouse_and_screen_resolution.py")
		commands = append(commands, copyTestdataFile("machine-configuration.json")...)
		commands = append(commands, "python mouse_and_screen_resolution.py --configuration-file machine-configuration.json")
		payload = GenericWorkerPayload{
			Command:    commands,
			MaxRunTime: 90,
			// Don't assume python 2 is in the default system PATH, but rather
			// require that python 2 is in the PATH of the test process.
			Env: map[string]string{
				"PATH": os.Getenv("PATH"),
			},
		}
		defaults.SetDefaults(&payload)
		td = testTask(t)
		return
	}

	// Not headless test
	td, payload := f(t, false)
	_ = submitAndAssert(t, td, payload, "completed", "completed")

	// Headless test
	td, payload = f(t, true)
	_ = submitAndAssert(t, td, payload, "failed", "failed")

}
