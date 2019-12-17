// +build multiuser,darwin multiuser,linux

package process

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"

	"github.com/taskcluster/generic-worker/host"
	"github.com/taskcluster/generic-worker/runtime"
)

type PlatformData struct {
	SysProcAttr *syscall.SysProcAttr
}

func NewPlatformData(currentUser bool) (pd *PlatformData, err error) {
	if currentUser {
		return &PlatformData{}, nil
	}
	return TaskUserPlatformData()
}

func TaskUserPlatformData() (pd *PlatformData, err error) {
	user, err := runtime.InteractiveUsername()
	if err != nil {
		return nil, fmt.Errorf("Could not determine interactive username: %v", err)
	}

	id := func(description string, command string, args ...string) (uint32, error) {
		out, err := host.CombinedOutput(command, args...)
		if err != nil {
			return 0, fmt.Errorf("Failed to run command to determine %v of user %v: %v", description, user, err)
		}
		idString := strings.TrimSpace(out)
		id, err := strconv.Atoi(idString)
		if err != nil {
			return 0, fmt.Errorf("Failed to convert %v %q from a string to an int: %v", description, idString, err)
		}
		return uint32(id), nil
	}

	uid, err := id("UID", "id", "-ur", user)
	if err != nil {
		return nil, err
	}
	gid, err := id("GID", "id", "-gr", user)
	if err != nil {
		return nil, err
	}

	return &PlatformData{
		SysProcAttr: &syscall.SysProcAttr{
			Credential: &syscall.Credential{
				Uid: uid,
				Gid: gid,
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

func NewCommand(commandLine []string, workingDirectory string, env []string, platformData *PlatformData) (*Command, error) {
	cmd := exec.Command(commandLine[0], commandLine[1:]...)
	cmd.Env = env
	cmd.Dir = workingDirectory
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if platformData.SysProcAttr != nil {
		cmd.SysProcAttr = platformData.SysProcAttr
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
