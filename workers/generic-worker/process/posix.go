//go:build darwin || linux || freebsd

package process

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/user"
	"strconv"
	"strings"
	"syscall"

	gwruntime "github.com/taskcluster/taskcluster/v100/workers/generic-worker/runtime"
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

func (c *Command) Kill() (killOutput string, err error) {
	// abort even if process hasn't started
	c.abortOnce.Do(func() { close(c.abort) })
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
