package process

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"github.com/taskcluster/generic-worker/runtime"
	"github.com/taskcluster/runlib/subprocess"
	"github.com/taskcluster/runlib/win32"
)

type Command struct {
	mutex sync.RWMutex
	*exec.Cmd
	Context    context.Context
	CancelFunc context.CancelFunc
}

type Result struct {
	SystemError error
	ExitError   *exec.ExitError
	Duration    time.Duration
	Aborted     bool
	KernelTime  time.Duration
	UserTime    time.Duration
}

func (r *Result) Succeeded() bool {
	return r.SystemError == nil && r.ExitError == nil
}

func (r *Result) Failed() bool {
	return (r.SystemError == nil && r.ExitError != nil) || r.Aborted
}

func (r *Result) CrashCause() error {
	return r.SystemError
}

func (r *Result) FailureCause() *exec.ExitError {
	return r.ExitError
}

func (r *Result) Crashed() bool {
	return r.SystemError != nil && !r.Aborted
}

func NewCommand(commandLine []string, workingDirectory string, env []string, loginInfo *subprocess.LoginInfo, deadline time.Time) (*Command, error) {
	if loginInfo != nil && loginInfo.HUser != 0 {
		environment, err := win32.CreateEnvironment(&env, loginInfo.HUser)
		if err != nil {
			return nil, err
		}
		env = *environment
	}
	var cancel context.CancelFunc
	var ctx context.Context
	if deadline.IsZero() {
		ctx = context.Background()
		cancel = func() {}
	} else {
		ctx, cancel = context.WithDeadline(context.Background(), deadline)
	}
	cmd := exec.CommandContext(ctx, commandLine[0], commandLine[1:]...)
	cmd.Env = env
	cmd.Dir = workingDirectory
	isWindows8OrGreater := win32.IsWindows8OrGreater()
	creationFlags := uint32(win32.CREATE_NEW_PROCESS_GROUP | win32.CREATE_NEW_CONSOLE)
	if !isWindows8OrGreater {
		creationFlags |= win32.CREATE_BREAKAWAY_FROM_JOB
	}
	if loginInfo != nil && loginInfo.HUser != 0 {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			Token:         syscall.Token(loginInfo.HUser),
			CreationFlags: creationFlags,
		}
	}
	return &Command{
		Context:    ctx,
		CancelFunc: cancel,
		Cmd:        cmd,
	}, nil
}

// Returns the exit code, or
//  -1 if the process has not exited
//  -2 if the process crashed
//  -3 it could not be established what happened
//  -4 if process was aborted
func (r *Result) ExitCode() int {
	if r.Aborted {
		return -4
	}
	if r.SystemError != nil {
		return -2
	}
	if r.ExitError == nil {
		return 0
	}
	if status, ok := r.ExitError.Sys().(syscall.WaitStatus); ok {
		return status.ExitStatus() // -1 if not exited
	}
	return -3
}

func (c *Command) Execute() (r *Result) {
	defer c.CancelFunc()
	r = &Result{}
	started := time.Now()
	c.mutex.Lock()
	err := c.Start()
	c.mutex.Unlock()
	if err != nil {
		r.SystemError = err
		return
	}
	err = c.Wait()
	finished := time.Now()
	// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
	r.Duration = finished.Round(0).Sub(started)
	r.Aborted = (c.Context.Err() != nil)
	r.UserTime = c.ProcessState.UserTime()
	r.KernelTime = c.ProcessState.SystemTime()
	if err != nil {
		if exiterr, ok := err.(*exec.ExitError); ok {
			r.ExitError = exiterr
		} else {
			r.SystemError = err
		}
	}
	return
}

func (c *Command) String() string {
	return fmt.Sprintf("%q", c.Args)
}

func (r *Result) String() string {
	return fmt.Sprintf(""+
		"   Exit Code: %v\n"+
		"   User Time: %v\n"+
		" Kernel Time: %v\n"+
		"   Wall Time: %v\n"+
		"      Result: %v",
		r.ExitCode(),
		r.UserTime,
		r.KernelTime,
		r.Duration,
		r.Verdict(),
	)
}

func (r *Result) Verdict() string {
	switch {
	case r.Aborted:
		return "ABORTED"
	case r.ExitError == nil:
		return "SUCCEEDED"
	default:
		return "FAILED"
	}
}

func (c *Command) DirectOutput(writer io.Writer) {
	c.Stdout = writer
	c.Stderr = writer
}

func (c *Command) Kill() error {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	return c.Process.Kill()
}

type LogonSession struct {
	User      *runtime.OSUser
	LoginInfo *subprocess.LoginInfo
}
