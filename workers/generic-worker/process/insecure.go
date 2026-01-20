//go:build insecure

package process

import (
	"os"
	"os/exec"
	"syscall"

	"context"

	gwruntime "github.com/taskcluster/taskcluster/v96/workers/generic-worker/runtime"
)

type PlatformData struct {
}

func NewPlatformData(headlessTasks bool, user *gwruntime.OSUser) (pd *PlatformData, err error) {
	return TaskUserPlatformData(user, headlessTasks)
}

func TaskUserPlatformData(u *gwruntime.OSUser, headlessTasks bool) (pd *PlatformData, err error) {
	return &PlatformData{}, nil
}

func (pd *PlatformData) ReleaseResources() error {
	return nil
}

func newCommand(f func() *exec.Cmd, workingDirectory string, env []string) (*Command, error) {
	cmd := f()
	cmd.Env = env
	cmd.Dir = workingDirectory
	// See https://medium.com/@felixge/killing-a-child-process-and-all-of-its-children-in-go-54079af94773
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return &Command{
		Cmd:   cmd,
		abort: make(chan struct{}),
	}, nil
}

func NewCommand(commandLine []string, workingDirectory string, env []string) (*Command, error) {
	f := func() *exec.Cmd {
		cmd := exec.Command(commandLine[0], commandLine[1:]...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd
	}
	return newCommand(f, workingDirectory, env)
}

func NewCommandNoOutputStreams(commandLine []string, workingDirectory string, env []string, platformData *PlatformData) (*Command, error) {
	f := func() *exec.Cmd {
		return exec.Command(commandLine[0], commandLine[1:]...)
	}
	return newCommand(f, workingDirectory, env)
}

func NewCommandContext(ctx context.Context, commandLine []string, workingDirectory string, env []string) (*Command, error) {
	f := func() *exec.Cmd {
		return exec.CommandContext(ctx, commandLine[0], commandLine[1:]...)
	}
	return newCommand(f, workingDirectory, env)
}
