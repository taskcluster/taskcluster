//go:build multiuser

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v110/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/win32"
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
	if os.Getenv("GW_SKIP_MSYS_TESTS") != "" {
		t.Skip("Skipping since GW_SKIP_MSYS_TESTS env var is set")
	}
	shell := msysShell(t)
	setup(t)

	commands := []string{"set PATH=" + win32.CMDExeEscape(filepath.Dir(shell)) + ";%PATH%"}
	// run several sh commands, as running one is horribly slow, but
	// let's make sure if you run a lot of them, they are not all slow -
	// hopefully just the first one is the problem
	for range 12 {
		commands = append(commands, run([]string{filepath.Base(shell), "-c", "echo hello"}, ""))
	}

	payload := GenericWorkerPayload{
		Command:    commands,
		MaxRunTime: 120,
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

// return the path of the shell shipped alongside git for windows
func msysShell(t *testing.T) string {
	t.Helper()

	git, err := exec.LookPath("git")
	if err != nil {
		t.Fatalf("Git not found in the PATH: %v", err)
	}
	// <root>\cmd\git.exe is next to <root>\usr\bin\sh.exe
	shell := filepath.Join(filepath.Dir(filepath.Dir(git)), "usr", "bin", "sh.exe")
	if _, err := os.Stat(shell); err != nil {
		t.Fatalf("Git didn't bring a shell alongside it at %v: %v", shell, err)
	}
	return shell
}

// TestHideCmdWindowEnabled verifies that when hideCmdWindow feature is enabled,
// the spawned process does not have a console window attached.
// This uses the GetConsoleWindow() Win32 API which returns NULL when no console
// is attached (i.e., when CREATE_NO_WINDOW flag is used).
func TestHideCmdWindowEnabled(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    goRun("check-console-window.go", "true"),
		MaxRunTime: 30,
		Features: FeatureFlags{
			HideCmdWindow: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

// TestHideCmdWindowDisabled verifies that when hideCmdWindow feature is disabled
// (the default), the spawned process has a console window attached.
// This uses the GetConsoleWindow() Win32 API which returns a non-NULL handle
// when a console is attached (i.e., when CREATE_NEW_CONSOLE flag is used).
func TestHideCmdWindowDisabled(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    goRun("check-console-window.go", "false"),
		MaxRunTime: 30,
		Features: FeatureFlags{
			HideCmdWindow: false,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

// TestHideCmdWindowDefault verifies that when hideCmdWindow feature is not
// explicitly set, the default behavior is to have a console window attached.
func TestHideCmdWindowDefault(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    goRun("check-console-window.go", "false"),
		MaxRunTime: 30,
		// Features.HideCmdWindow not set - should default to false
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
