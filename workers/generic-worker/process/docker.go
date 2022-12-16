//go:build docker

package process

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"syscall"
	"time"

	"github.com/taskcluster/shell"
	"golang.org/x/net/context"
)

type PlatformData struct{}

func (pd *PlatformData) ReleaseResources() error {
	return nil
}

type Result struct {
	SystemError error
	exitCode    int64
	Duration    time.Duration
}

type Command struct {
	ctx              context.Context
	writer           io.Writer
	cmd              []string
	workingDirectory string
	env              []string
}

func (c *Command) SetEnv(envVar, value string) {
	c.env = append(c.env, envVar+"="+value)
}

func (c *Command) DirectOutput(writer io.Writer) {
	c.writer = writer
}

func (c *Command) String() string {
	return shell.Escape(c.cmd...)
}

func (c *Command) Execute() (r *Result) {
	r = &Result{}

	// TODO these need to be configurable
	podmanPath, err := exec.LookPath("podman")
	if err != nil {
		podmanPath = "/usr/bin/podman"
		log.Printf("Could not find podman in PATH, defaulting to %v", podmanPath)
	}
	image := "ubuntu"

	// TODO scary injection potential here
	cmd := exec.CommandContext(c.ctx, podmanPath, append([]string{"run", image}, c.cmd...)...)
	// something went horribly wrong
	if cmd == nil {
		r.SystemError = fmt.Errorf("nil command")
		return
	}

	cmd.Env = c.env
	cmd.Dir = c.workingDirectory
	cmd.Stderr = c.writer
	cmd.Stdout = c.writer

	startTime := time.Now()

	log.Printf("Running podman command: %v", c.String())
	err = cmd.Run()
	if err != nil {
		log.Printf("Podman command %v failed: %v", c.String(), err.Error())
		r.SystemError = err
		if e, ok := err.(*exec.ExitError); ok && !e.Success() {
			// TODO use this in the future
			// ExitCode is new in Go 1.12
			// r.exitCode = int64(e.ExitCode())
			if status, ok := e.Sys().(syscall.WaitStatus); ok {
				r.exitCode = int64(status.ExitStatus())
			}
		}
		return
	}

	r.Duration = time.Since(startTime)

	return
}

func (r *Result) ExitCode() int64 {
	return r.exitCode
}

func (r *Result) CrashCause() error {
	return r.SystemError
}

func (r *Result) Crashed() bool {
	return r.SystemError != nil
}

func (r *Result) FailureCause() error {
	return fmt.Errorf("Exit code %v", r.exitCode)
}

func (r *Result) Failed() bool {
	return r.exitCode != 0
}

func NewCommand(commandLine []string, workingDirectory string, env []string) (*Command, error) {
	c := &Command{
		ctx:              context.Background(),
		writer:           os.Stdout,
		cmd:              commandLine,
		workingDirectory: workingDirectory,
		env:              env,
	}
	return c, nil
}

func (c *Command) Kill() ([]byte, error) {
	return nil, nil
}
