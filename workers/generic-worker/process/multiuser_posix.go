//go:build multiuser && (darwin || linux || freebsd)

package process

import (
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"strconv"
	"syscall"

	"context"

	gwruntime "github.com/taskcluster/taskcluster/v93/workers/generic-worker/runtime"
)

type PlatformData struct {
	SysProcAttr *syscall.SysProcAttr
}

func NewPlatformData(headlessTasks bool, user *gwruntime.OSUser) (pd *PlatformData, err error) {
	return TaskUserPlatformData(user, headlessTasks)
}

func TaskUserPlatformData(u *gwruntime.OSUser, headlessTasks bool) (pd *PlatformData, err error) {
	usr, err := user.Lookup(u.Name)
	if err != nil {
		return nil, fmt.Errorf("failed to lookup user: %w", err)
	}

	uid, err := strconv.ParseUint(usr.Uid, 10, 32)
	if err != nil {
		return nil, fmt.Errorf("failed to convert UID to int: %w", err)
	}

	gid, err := strconv.ParseUint(usr.Gid, 10, 32)
	if err != nil {
		return nil, fmt.Errorf("failed to convert GID to int: %w", err)
	}

	groupIDs, err := usr.GroupIds()
	if err != nil {
		return nil, fmt.Errorf("failed to get group IDs: %w", err)
	}

	var gids []uint32
	for _, gidStr := range groupIDs {
		gid, err := strconv.ParseUint(gidStr, 10, 32)
		if err != nil {
			return nil, fmt.Errorf("failed to convert GID to int: %w", err)
		}
		gids = append(gids, uint32(gid))
	}

	return &PlatformData{
		SysProcAttr: &syscall.SysProcAttr{
			Credential: &syscall.Credential{
				Uid:    uint32(uid),
				Gid:    uint32(gid),
				Groups: gids,
			},
		},
	}, nil
}

func (pd *PlatformData) ReleaseResources() error {
	return nil
}

func newCommand(f func() *exec.Cmd, workingDirectory string, env []string, platformData *PlatformData) (*Command, error) {
	cmd := f()
	cmd.Env = env
	cmd.Dir = workingDirectory
	if platformData.SysProcAttr != nil {
		attrs := *platformData.SysProcAttr
		cmd.SysProcAttr = &attrs
	} else {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	// See https://medium.com/@felixge/killing-a-child-process-and-all-of-its-children-in-go-54079af94773
	cmd.SysProcAttr.Setpgid = true
	return &Command{
		Cmd:   cmd,
		abort: make(chan struct{}),
	}, nil
}

func NewCommand(commandLine []string, workingDirectory string, env []string, platformData *PlatformData) (*Command, error) {
	f := func() *exec.Cmd {
		cmd := exec.Command(commandLine[0], commandLine[1:]...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd
	}
	return newCommand(f, workingDirectory, env, platformData)
}

func NewCommandNoOutputStreams(commandLine []string, workingDirectory string, env []string, platformData *PlatformData) (*Command, error) {
	f := func() *exec.Cmd {
		return exec.Command(commandLine[0], commandLine[1:]...)
	}
	return newCommand(f, workingDirectory, env, platformData)
}

func NewCommandContext(ctx context.Context, commandLine []string, workingDirectory string, env []string, platformData *PlatformData) (*Command, error) {
	f := func() *exec.Cmd {
		return exec.CommandContext(ctx, commandLine[0], commandLine[1:]...)
	}
	return newCommand(f, workingDirectory, env, platformData)
}
