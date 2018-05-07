// +build !windows

package process

import (
	"fmt"
	"io"
	"log"
	"os/exec"
	"strconv"
	"sync"
	"syscall"
	"time"
)

type Command struct {
	mutex sync.RWMutex
	*exec.Cmd
}

type Result struct {
	SystemError error
	ExitError   *exec.ExitError
	Duration    time.Duration
}

func (r *Result) Succeeded() bool {
	return r.SystemError == nil && r.ExitError == nil
}

func (r *Result) Failed() bool {
	return r.SystemError == nil && r.ExitError != nil
}

func (r *Result) CrashCause() error {
	return r.SystemError
}

func (r *Result) FailureCause() *exec.ExitError {
	return r.ExitError
}

func (r *Result) Crashed() bool {
	return r.SystemError != nil
}

func NewCommand(commandLine []string, workingDirectory string, env []string) (*Command, error) {
	cmd := exec.Command(commandLine[0], commandLine[1:]...)
	cmd.Env = env
	cmd.Dir = workingDirectory
	return &Command{
		Cmd: cmd,
	}, nil
}

// Returns the exit code, or
//  -1 if the process has not exited
//  -2 if the process crashed
//  -3 it could not be established what happened
func (r *Result) ExitCode() int {
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
	err = c.Wait()
	finished := time.Now()
	// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
	r.Duration = finished.Round(0).Sub(started)
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
	return "Exit Code: " + strconv.Itoa(r.ExitCode())
}

func (c *Command) DirectOutput(writer io.Writer) {
	c.Stdout = writer
	c.Stderr = writer
}

func (c *Command) Kill() error {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	if c.Process == nil {
		// If process hasn't been started yet, nothing to kill
		return nil
	}
	log.Printf("Killing process with ID %v... (%p)", c.Process.Pid, c)
	defer log.Printf("Process with ID %v killed.", c.Process.Pid)
	return c.Process.Kill()
}
