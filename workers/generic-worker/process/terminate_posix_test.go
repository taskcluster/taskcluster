//go:build darwin || linux || freebsd

package process

import (
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// terminateTest runs a shell script, with its output written to a file (so
// that cmd.Wait() returns as soon as the shell exits, even if it leaves other
// processes running in its process group).
type terminateTest struct {
	t       *testing.T
	cmd     *Command
	outFile string
	result  chan *Result
	started time.Time
	killed  atomic.Bool
}

func startTerminateTest(t *testing.T, script string) *terminateTest {
	t.Helper()
	outFile := filepath.Join(t.TempDir(), "output.txt")
	out, err := os.Create(outFile)
	if err != nil {
		t.Fatalf("could not create output file: %v", err)
	}
	t.Cleanup(func() { _ = out.Close() })
	cmd := newShellCommand(t, script)
	cmd.DirectOutput(out)
	tt := &terminateTest{
		t:       t,
		cmd:     cmd,
		outFile: outFile,
		result:  make(chan *Result, 1),
		started: time.Now(),
	}
	go func() {
		tt.result <- cmd.Execute()
	}()
	t.Cleanup(func() {
		// make sure nothing is left running if the test failed
		_, _ = cmd.Kill()
	})
	return tt
}

func (tt *terminateTest) output() string {
	tt.t.Helper()
	b, err := os.ReadFile(tt.outFile)
	if err != nil {
		tt.t.Fatalf("could not read output file: %v", err)
	}
	return string(b)
}

func (tt *terminateTest) waitForOutput(text string) {
	tt.t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	for !strings.Contains(tt.output(), text) {
		if time.Now().After(deadline) {
			tt.t.Fatalf("timed out waiting for output %q, got:\n%v", text, tt.output())
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func (tt *terminateTest) terminate(grace time.Duration) {
	tt.t.Helper()
	_, err := tt.cmd.Terminate(grace, func() { tt.killed.Store(true) })
	if err != nil {
		tt.t.Fatalf("Terminate returned error: %v", err)
	}
}

func (tt *terminateTest) pid() int {
	tt.cmd.mutex.RLock()
	defer tt.cmd.mutex.RUnlock()
	return tt.cmd.pidLocked()
}

func (tt *terminateTest) waitForResult(timeout time.Duration) (*Result, time.Duration) {
	tt.t.Helper()
	select {
	case r := <-tt.result:
		return r, time.Since(tt.started)
	case <-time.After(timeout):
		tt.t.Fatalf("Execute() did not return within %v, output:\n%v", timeout, tt.output())
	}
	return nil, 0
}

func ensureProcessGroupGone(t *testing.T, pgid int) {
	t.Helper()
	// allow time for killed processes to be reaped
	deadline := time.Now().Add(10 * time.Second)
	for processGroupExists(pgid) {
		if time.Now().After(deadline) {
			t.Fatalf("process group %v still has running processes", pgid)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestTerminateProcessExitsOnSIGTERM(t *testing.T) {
	tt := startTerminateTest(t, `trap 'echo caught SIGTERM; exit 0' TERM; echo started; sleep 600 & wait`)
	tt.waitForOutput("started")
	tt.terminate(30 * time.Second)
	// a second call should have no effect
	tt.terminate(30 * time.Second)
	r, _ := tt.waitForResult(20 * time.Second)
	if !r.Aborted {
		t.Fatalf("expected command to be reported as aborted, got: %v", r)
	}
	if r.ExitCode != -4 {
		t.Fatalf("expected exit code -4 for aborted command, got %v", r.ExitCode)
	}
	if !strings.Contains(tt.output(), "caught SIGTERM") {
		t.Fatalf("expected process to handle SIGTERM, got output:\n%v", tt.output())
	}
	if tt.killed.Load() {
		t.Fatal("process exited during grace period, but was killed anyway")
	}
}

func TestTerminateKillsProcessIgnoringSIGTERM(t *testing.T) {
	tt := startTerminateTest(t, `trap '' TERM; echo started; while true; do sleep 1; done`)
	tt.waitForOutput("started")
	pid := tt.pid()
	terminated := time.Now()
	tt.terminate(2 * time.Second)
	r, _ := tt.waitForResult(20 * time.Second)
	if elapsed := time.Since(terminated); elapsed < 2*time.Second {
		t.Fatalf("expected process to be killed after grace period of 2s, but Execute() returned after %v", elapsed)
	}
	if !r.Aborted {
		t.Fatalf("expected command to be reported as aborted, got: %v", r)
	}
	if !tt.killed.Load() {
		t.Fatal("expected beforeKill to be called")
	}
	ensureProcessGroupGone(t, pid)
}

func TestTerminateWaitsForProcessGroup(t *testing.T) {
	// The shell exits on SIGTERM, but leaves a child process (that ignores
	// SIGTERM) running for a few more seconds. Execute() should only return
	// once the child process has exited too.
	tt := startTerminateTest(t, `
(trap '' TERM; echo child ready; sleep 3; echo child done) &
trap 'echo caught SIGTERM; exit 0' TERM
echo started
while true; do sleep 1; done`)
	tt.waitForOutput("started")
	tt.waitForOutput("child ready")
	pid := tt.pid()
	tt.terminate(30 * time.Second)
	// Terminating again once the shell has exited, while the child process is
	// still running, should have no effect.
	select {
	case <-tt.cmd.waited:
	case <-time.After(20 * time.Second):
		t.Fatalf("shell did not exit on SIGTERM, output:\n%v", tt.output())
	}
	tt.terminate(30 * time.Second)
	r, _ := tt.waitForResult(20 * time.Second)
	if !r.Aborted {
		t.Fatalf("expected command to be reported as aborted, got: %v", r)
	}
	if !strings.Contains(tt.output(), "child done") {
		t.Fatalf("expected Execute() to wait for child process to exit, got output:\n%v", tt.output())
	}
	if tt.killed.Load() {
		t.Fatal("processes exited during grace period, but were killed anyway")
	}
	ensureProcessGroupGone(t, pid)
}

func TestTerminateKillsProcessGroupAfterGracePeriod(t *testing.T) {
	tt := startTerminateTest(t, `
(trap '' TERM; echo child ready; sleep 30; echo child done) &
trap 'echo caught SIGTERM; exit 0' TERM
echo started
while true; do sleep 1; done`)
	tt.waitForOutput("started")
	tt.waitForOutput("child ready")
	pid := tt.pid()
	tt.terminate(time.Second)
	r, _ := tt.waitForResult(20 * time.Second)
	if !r.Aborted {
		t.Fatalf("expected command to be reported as aborted, got: %v", r)
	}
	if !tt.killed.Load() {
		t.Fatal("expected beforeKill to be called")
	}
	ensureProcessGroupGone(t, pid)
	if strings.Contains(tt.output(), "child done") {
		t.Fatalf("expected child process to be killed, got output:\n%v", tt.output())
	}
}

func TestKillDuringGracePeriod(t *testing.T) {
	tt := startTerminateTest(t, `trap '' TERM; echo started; while true; do sleep 1; done`)
	tt.waitForOutput("started")
	pid := tt.pid()
	tt.terminate(time.Minute)
	time.Sleep(500 * time.Millisecond)
	_, err := tt.cmd.Kill()
	if err != nil {
		t.Fatalf("Kill returned error: %v", err)
	}
	r, _ := tt.waitForResult(20 * time.Second)
	if !r.Aborted {
		t.Fatalf("expected command to be reported as aborted, got: %v", r)
	}
	ensureProcessGroupGone(t, pid)
}

func TestTerminateWithoutGracePeriodKillsImmediately(t *testing.T) {
	tt := startTerminateTest(t, `trap 'echo caught SIGTERM; exit 0' TERM; echo started; sleep 600 & wait`)
	tt.waitForOutput("started")
	pid := tt.pid()
	tt.terminate(0)
	r, _ := tt.waitForResult(20 * time.Second)
	if !r.Aborted {
		t.Fatalf("expected command to be reported as aborted, got: %v", r)
	}
	ensureProcessGroupGone(t, pid)
	if strings.Contains(tt.output(), "caught SIGTERM") {
		t.Fatalf("expected process to be killed without SIGTERM, got output:\n%v", tt.output())
	}
}

func TestTerminateBeforeStart(t *testing.T) {
	cmd := newShellCommand(t, "exit 0")
	_, err := cmd.Terminate(30*time.Second, nil)
	if err != nil {
		t.Fatalf("Terminate returned error: %v", err)
	}
	r := cmd.Execute()
	if !r.Aborted {
		t.Fatalf("expected command to be reported as aborted, got: %v", r)
	}
}
