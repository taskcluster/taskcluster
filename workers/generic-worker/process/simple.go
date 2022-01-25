//go:build simple
// +build simple

package process

import (
	"fmt"
	"log"
	"os/exec"
	"syscall"
)

type PlatformData struct {
}

func (pd *PlatformData) ReleaseResources() error {
	return nil
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

func (c *Command) SetEnv(envVar, value string) {
	c.Cmd.Env = append(c.Cmd.Env, envVar+"="+value)
}

func (c *Command) Kill() (killOutput string, err error) {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	if c.Process == nil {
		// If process hasn't been started yet, nothing to kill
		return "", nil
	}
	close(c.abort)
	log.Printf("Killing process tree with parent PID %v... (%p)", c.Process.Pid, c)
	defer log.Printf("Process tree with parent PID %v killed.", c.Process.Pid)
	// See https://medium.com/@felixge/killing-a-child-process-and-all-of-its-children-in-go-54079af94773
	return "", syscall.Kill(-c.Process.Pid, syscall.SIGKILL)
}
