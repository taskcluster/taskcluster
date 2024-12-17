//go:build multiuser && (darwin || linux || freebsd)

package process

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/user"
	"strconv"
	"syscall"

	gwruntime "github.com/taskcluster/taskcluster/v77/workers/generic-worker/runtime"
	"golang.org/x/net/context"
)

type PlatformData struct {
	SysProcAttr *syscall.SysProcAttr
}

func NewPlatformData(currentUser bool, headlessTasks bool, user *gwruntime.OSUser) (pd *PlatformData, err error) {
	if currentUser {
		return &PlatformData{}, nil
	}
	return TaskUserPlatformData(user, headlessTasks)
}

func TaskUserPlatformData(u *gwruntime.OSUser, headlessTasks bool) (pd *PlatformData, err error) {
	usr, err := user.Lookup(u.Name)
	if err != nil {
		return nil, fmt.Errorf("failed to lookup user: %w", err)
	}

	uid, err := strconv.Atoi(usr.Uid)
	if err != nil {
		return nil, fmt.Errorf("failed to convert UID to int: %w", err)
	}

	gid, err := strconv.Atoi(usr.Gid)
	if err != nil {
		return nil, fmt.Errorf("failed to convert GID to int: %w", err)
	}

	groupIDs, err := usr.GroupIds()
	if err != nil {
		return nil, fmt.Errorf("failed to get group IDs: %w", err)
	}

	var gids []uint32
	for _, gidStr := range groupIDs {
		gid, err := strconv.Atoi(gidStr)
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

func (c *Command) SetEnv(envVar, value string) {
	c.Cmd.Env = append(c.Cmd.Env, envVar+"="+value)
}

func (c *Command) Kill() (killOutput string, err error) {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	// abort even if process hasn't started
	close(c.abort)
	if c.Process == nil {
		// If process hasn't been started yet, nothing to kill
		return "", nil
	}
	log.Printf("Killing process tree with parent PID %v... (%p)", c.Process.Pid, c)
	defer log.Printf("Process tree with parent PID %v killed.", c.Process.Pid)
	// See https://medium.com/@felixge/killing-a-child-process-and-all-of-its-children-in-go-54079af94773
	return "", syscall.Kill(-c.Process.Pid, syscall.SIGKILL)
}
