//go:build darwin || linux || freebsd

package process

import (
	"fmt"
	"log"
	"strings"
	"syscall"
)

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
		return fmt.Errorf("task was aborted")
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

func (c *Command) SetEnv(envVar, value string) {
	prefix := envVar + "="
	for i, e := range c.Env {
		if strings.HasPrefix(e, prefix) {
			c.Env[i] = prefix + value
			return
		}
	}
	c.Env = append(c.Env, prefix+value)
}

func (c *Command) Kill() (killOutput string, err error) {
	// abort even if process hasn't started
	close(c.abort)
	c.mutex.Lock()
	defer c.mutex.Unlock()
	// if pid has been set in result, use that
	pid := 0
	switch true {
	case c.Process != nil && c.Process.Pid != 0:
		pid = c.Process.Pid
	case c.result != nil && c.result.Pid != 0:
		pid = c.result.Pid
	default:
		// If process hasn't been started yet, nothing to kill
		return "", nil
	}
	log.Printf("Killing process tree with parent PID %v... (%p)", pid, c)
	defer log.Printf("Process tree with parent PID %v killed.", pid)
	// See https://medium.com/@felixge/killing-a-child-process-and-all-of-its-children-in-go-54079af94773
	return "", syscall.Kill(-pid, syscall.SIGKILL)
}
