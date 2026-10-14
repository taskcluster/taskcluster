//go:build darwin || linux || freebsd

package process

import (
	"fmt"
	"log"
	"strings"
	"syscall"
	"time"
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

// SetEnv sets an environment variable for the process, replacing any
// existing entry with the same name.
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

// GracefulTerminationSupported is true when Terminate() gives task processes
// a chance to exit before killing them.
const GracefulTerminationSupported = true

// pidLocked returns the PID of the process (which is also its process group
// ID, since Setpgid is set), or 0 if it hasn't been started yet. Must be
// called while holding c.mutex.
func (c *Command) pidLocked() int {
	// if pid has been set in result, use that
	switch true {
	case c.Process != nil && c.Process.Pid != 0:
		return c.Process.Pid
	case c.result != nil && c.result.Pid != 0:
		return c.result.Pid
	}
	return 0
}

func (c *Command) Kill() (killOutput string, err error) {
	// abort even if process hasn't started
	c.abortOnce.Do(func() { close(c.abort) })
	c.mutex.Lock()
	defer c.mutex.Unlock()
	pid := c.pidLocked()
	if pid == 0 {
		// If process hasn't been started yet, nothing to kill
		return "", nil
	}
	log.Printf("Killing process tree with parent PID %v... (%p)", pid, c)
	defer log.Printf("Process tree with parent PID %v killed.", pid)
	// See https://medium.com/@felixge/killing-a-child-process-and-all-of-its-children-in-go-54079af94773
	return "", syscall.Kill(-pid, syscall.SIGKILL)
}

// Terminate sends SIGTERM to the process group of the command, and then kills
// it (see Kill()) if any process in the group is still running after grace
// has elapsed. If not nil, beforeKill is called just before the process group
// is killed. Terminate does not wait for the processes to exit: Execute()
// returns once the process group has exited, or has been killed, and reports
// the command as aborted.
//
// If grace is not positive, or the process hasn't been started yet, or has
// already exited, Terminate is equivalent to Kill(). Kill() may be called at
// any time, including during the grace period.
func (c *Command) Terminate(grace time.Duration, beforeKill func()) (killOutput string, err error) {
	if grace <= 0 {
		return c.Kill()
	}
	c.mutex.Lock()
	select {
	case <-c.abort:
		// already killed, or terminated
		c.mutex.Unlock()
		return "", nil
	case <-c.waited:
		// process has already exited, so just kill anything left behind in
		// its process group
		c.mutex.Unlock()
		return c.Kill()
	default:
	}
	if c.terminating {
		c.mutex.Unlock()
		return "", nil
	}
	pid := c.pidLocked()
	if pid == 0 {
		c.mutex.Unlock()
		return c.Kill()
	}
	c.terminating = true
	c.mutex.Unlock()

	log.Printf("Sending SIGTERM to process tree with parent PID %v... (%p)", pid, c)
	err = syscall.Kill(-pid, syscall.SIGTERM)
	if err != nil && err != syscall.ESRCH {
		log.Printf("Could not send SIGTERM to process tree with parent PID %v: %v", pid, err)
		return c.Kill()
	}
	go c.awaitTermination(pid, grace, beforeKill)
	return "", nil
}

// awaitTermination waits until the command has exited and no processes are
// left in its process group, and then releases Execute(). If that doesn't
// happen within grace, the process group is killed instead.
func (c *Command) awaitTermination(pgid int, grace time.Duration, beforeKill func()) {
	deadline := time.NewTimer(grace)
	defer deadline.Stop()
	kill := func() {
		log.Printf("Process tree with parent PID %v still running %v after SIGTERM", pgid, grace)
		if beforeKill != nil {
			beforeKill()
		}
		if _, err := c.Kill(); err != nil {
			log.Printf("WARNING: %v", err)
		}
	}
	select {
	case <-c.abort:
		return
	case <-deadline.C:
		kill()
		return
	case <-c.waited:
	}
	// The command has exited, but it may have left other processes running
	// in its process group (e.g. a shell exits on SIGTERM straight away, while
	// the program it started is still shutting down).
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for processGroupExists(pgid) {
		select {
		case <-c.abort:
			return
		case <-deadline.C:
			kill()
			return
		case <-ticker.C:
		}
	}
	log.Printf("Process tree with parent PID %v exited after SIGTERM", pgid)
	c.abortOnce.Do(func() { close(c.abort) })
}

func processGroupExists(pgid int) bool {
	err := syscall.Kill(-pgid, 0)
	return err == nil || err == syscall.EPERM
}
