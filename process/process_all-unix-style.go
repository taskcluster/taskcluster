// +build !windows

package process

import (
	"fmt"
	"io"
	"log"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

type Command struct {
	mutex sync.RWMutex
	*exec.Cmd
	// abort channel is closed when Kill() is called so that Execute() can
	// return even if cmd.Wait() is blocked. This is useful since cmd.Wait()
	// sometimes does not return promptly.
	abort chan struct{}
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
	return r.SystemError == nil && r.ExitError == nil && !r.Aborted
}

// Unlike on Windows, a system error is grounds for a task failure, rather than
// a task exception, since it can be caused by e.g. a task trying to execute a
// command that doesn't exist, or trying to execute a file that isn't
// executable. Therefore a system error, or an exit error (process ran but
// returned non-zero exit code) or a task abortion are all task failures.
//
// See https://bugzil.la/1479415
func (r *Result) Failed() bool {
	return r.SystemError != nil || r.ExitError != nil || r.Aborted
}

// Unlike on Windows, if there is a system error, we don't crash the worker,
// since this can be caused by task that tries to execute a non-existing
// command or a file that isn't executable. On Windows all commands are
// wrapped in a command shell execution, where not being able to execute a
// shell should cause the worker to panic.
func (r *Result) CrashCause() error {
	return nil
}

func (r *Result) FailureCause() error {
	if r.Aborted {
		return fmt.Errorf("Task was aborted")
	}
	if r.ExitError != nil {
		return r.ExitError
	}
	if r.SystemError != nil {
		return r.SystemError
	}
	return nil
}

// Unlike on Windows, if there is a system error, we don't crash the worker,
// since this can be caused by task that tries to execute a non-existing
// command or a file that isn't executable. On Windows all commands are
// wrapped in a command shell execution, where not being able to execute a
// shell should cause the worker to panic.
//
// See https://bugzil.la/1479415
func (r *Result) Crashed() bool {
	return false
}

func NewCommand(commandLine []string, workingDirectory string, env []string) (*Command, error) {
	cmd := exec.Command(commandLine[0], commandLine[1:]...)
	cmd.Env = env
	cmd.Dir = workingDirectory
	// See https://medium.com/@felixge/killing-a-child-process-and-all-of-its-children-in-go-54079af94773
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return &Command{
		Cmd:   cmd,
		abort: make(chan struct{}),
	}, nil
}

// ExitCode returns the exit code, or
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
	r = &Result{}
	started := time.Now()
	c.mutex.Lock()
	err := c.Start()
	c.mutex.Unlock()
	if err != nil {
		r.SystemError = err
		return
	}
	exitErr := make(chan error)
	// wait for command to complete in separate go routine, so we handle abortion in parallel to command termination
	go func() {
		err := c.Wait()
		exitErr <- err
	}()
	select {
	case err = <-exitErr:
		r.UserTime = c.ProcessState.UserTime()
		r.KernelTime = c.ProcessState.SystemTime()
		if err != nil {
			if exiterr, ok := err.(*exec.ExitError); ok {
				r.ExitError = exiterr
			} else {
				r.SystemError = err
			}
		}
	case <-c.abort:
		r.SystemError = fmt.Errorf("Process aborted")
		r.Aborted = true
	}
	finished := time.Now()
	// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
	r.Duration = finished.Round(0).Sub(started)
	return
}

func (c *Command) String() string {
	return fmt.Sprintf("%q", c.Args)
}

func (r *Result) String() string {
	if r.Aborted {
		return fmt.Sprintf("Command ABORTED after %v", r.Duration)
	}
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

func (c *Command) Kill() ([]byte, error) {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	if c.Process == nil {
		// If process hasn't been started yet, nothing to kill
		return []byte{}, nil
	}
	close(c.abort)
	log.Printf("Killing process tree with parent PID %v... (%p)", c.Process.Pid, c)
	defer log.Printf("Process tree with parent PID %v killed.", c.Process.Pid)
	// See https://medium.com/@felixge/killing-a-child-process-and-all-of-its-children-in-go-54079af94773
	return []byte{}, syscall.Kill(-c.Process.Pid, syscall.SIGKILL)
}
