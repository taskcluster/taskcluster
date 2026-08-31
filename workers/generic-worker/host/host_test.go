package host

import (
	"runtime"
	"strings"
	"testing"
)

func failingCommand() []string {
	if runtime.GOOS == "windows" {
		return []string{"cmd", "/c", "echo kaboom & exit 1"}
	}
	return []string{"/bin/sh", "-c", "echo kaboom; exit 1"}
}

func successfulCommand() []string {
	if runtime.GOOS == "windows" {
		return []string{"cmd", "/c", "exit 0"}
	}
	return []string{"/bin/sh", "-c", "exit 0"}
}

func TestRunReturnsErrorOnFailure(t *testing.T) {
	cmd := failingCommand()
	if err := Run(cmd[0], cmd[1:]...); err == nil {
		t.Fatal("Run didn't return an error despite the command failing")
	}
}

func TestCombinedOutputReturnsErrorAndOutput(t *testing.T) {
	cmd := failingCommand()
	out, err := CombinedOutput(cmd[0], cmd[1:]...)
	if err == nil {
		t.Fatal("CombinedOutput didn't return an error despite the command failing")
	}
	if !strings.Contains(out, "kaboom") {
		t.Fatalf("CombinedOutput did not return command output, got %q", out)
	}
}

func TestRunBatchReturnsErrorWhenFailNotAllowed(t *testing.T) {
	if err := RunBatch(false, failingCommand(), successfulCommand()); err == nil {
		t.Fatal("RunBatch did not return an error for a failing command")
	}
}

func TestRunIgnoreError(t *testing.T) {
	cmd := failingCommand()

	found, err := RunIgnoreError("kaboom", cmd[0], cmd[1:]...)
	if err != nil {
		t.Fatalf("RunIgnoreError returned an error despite the expected output being there: %v", err)
	}
	if !found {
		t.Fatal("RunIgnoreError did not report the expected output as found")
	}

	found, err = RunIgnoreError("not in output", cmd[0], cmd[1:]...)
	if err == nil {
		t.Fatal("RunIgnoreError did not return an error for an unexpected command failure")
	}
	if found {
		t.Fatal("RunIgnoreError reported output as found. It was not")
	}

	ok := successfulCommand()
	found, err = RunIgnoreError("kaboom", ok[0], ok[1:]...)
	if err != nil {
		t.Fatalf("RunIgnoreError returned an error for a successful command: %v", err)
	}
	if found {
		t.Fatal("RunIgnoreError reported output found for a successful command")
	}
}
