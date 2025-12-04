//go:build multiuser

package process

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"syscall"
	"time"

	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/host"
	gwruntime "github.com/taskcluster/taskcluster/v94/workers/generic-worker/runtime"
	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/win32"
)

var sidsThatCanControlDesktopAndWindowsStation map[string]bool = map[string]bool{}

type PlatformData struct {
	CommandAccessToken syscall.Token
	LoginInfo          *LoginInfo
}

func NewPlatformData(headlessTasks bool, user *gwruntime.OSUser) (pd *PlatformData, err error) {
	pd, err = TaskUserPlatformData(user, headlessTasks)
	if err != nil {
		return
	}
	return
}

func TaskUserPlatformData(user *gwruntime.OSUser, headlessTasks bool) (pd *PlatformData, err error) {
	pd = &PlatformData{}
	if headlessTasks {
		pd.LoginInfo, err = NewLoginInfo(user.Name, user.Password)
	} else {
		pd.LoginInfo, err = InteractiveLoginInfo(3 * time.Minute)
	}
	if err != nil {
		return
	}
	pd.CommandAccessToken = pd.LoginInfo.AccessToken()
	win32.DumpTokenInfo(pd.CommandAccessToken)
	return
}

func (pd *PlatformData) ReleaseResources() error {
	pd.CommandAccessToken = 0
	return pd.LoginInfo.Release()
}

func (r *Result) Failed() bool {
	return (r.SystemError == nil && r.ExitError != nil) || r.Aborted
}

func (r *Result) CrashCause() error {
	return r.SystemError
}

func (r *Result) FailureCause() *exec.ExitError {
	return r.ExitError
}

func (r *Result) Crashed() bool {
	return r.SystemError != nil && !r.Aborted
}

func newCommand(f func() *exec.Cmd, workingDirectory string, env []string, pd *PlatformData) (*Command, error) {
	cmd := f()
	var err error
	var combined *[]string
	accessToken := pd.CommandAccessToken
	if accessToken != 0 {
		// in task-user mode, we must merge env with the task user's environment
		combined, err = win32.CreateEnvironment(&env, accessToken)
	} else {
		// in current-user mode, we merge env with the *current* environment
		parentEnv := os.Environ()
		combined, err = win32.MergeEnvLists(&parentEnv, &env)

	}
	if err != nil {
		return nil, err
	}
	cmd.Env = *combined
	cmd.Dir = workingDirectory
	isWindows8OrGreater := win32.IsWindows8OrGreater()
	creationFlags := uint32(win32.CREATE_NEW_PROCESS_GROUP | win32.CREATE_NEW_CONSOLE)
	if !isWindows8OrGreater {
		creationFlags |= win32.CREATE_BREAKAWAY_FROM_JOB
	}
	if accessToken != 0 {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			Token:         accessToken,
			CreationFlags: creationFlags,
		}
	}
	return &Command{
		Cmd:   cmd,
		abort: make(chan struct{}),
	}, nil
}

func NewCommand(commandLine []string, workingDirectory string, env []string, pd *PlatformData) (*Command, error) {
	f := func() *exec.Cmd {
		cmd := exec.Command(commandLine[0], commandLine[1:]...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd
	}
	return newCommand(f, workingDirectory, env, pd)
}

func NewCommandNoOutputStreams(commandLine []string, workingDirectory string, env []string, pd *PlatformData) (*Command, error) {
	f := func() *exec.Cmd {
		return exec.Command(commandLine[0], commandLine[1:]...)
	}
	return newCommand(f, workingDirectory, env, pd)
}

func (c *Command) Kill() (killOutput string, err error) {
	// abort even if process hasn't started
	close(c.abort)
	c.mutex.Lock()
	defer c.mutex.Unlock()
	if c.Process == nil {
		// If process hasn't been started yet, nothing to kill
		return "", nil
	}
	// Concurrent access to c.ProcessState is not thread safe - so let's not do this.
	// Need to find a better way to manage this...
	// if c.ProcessState != nil {
	// 	// If process has finished, nothing to kill
	// 	return
	// }
	log.Printf("Killing process tree with parent PID %v... (%p)", c.Process.Pid, c)
	defer log.Printf("taskkill.exe command has completed for PID %v", c.Process.Pid)
	// here we use taskkill.exe rather than c.Process.Kill() since we want child processes also to be killed
	return host.CombinedOutput("taskkill.exe", "/pid", strconv.Itoa(c.Process.Pid), "/f", "/t")
}

func (pd *PlatformData) RefreshLoginSession(user, pass string, winstaAccess bool) {
	err := pd.LoginInfo.Release()
	if err != nil {
		panic(err)
	}
	if winstaAccess {
		// This is the SID of "Everyone" group
		// TODO: we should probably change this to the logon SID of the user
		sid := "S-1-1-0"
		GrantSIDWinstaAccess(sid, pd)
	}
	pd.LoginInfo, err = NewLoginInfo(user, pass)
	if err != nil {
		// implies a serious bug
		panic(err)
	}
	if winstaAccess {
		err = pd.LoginInfo.SetActiveConsoleSessionId()
		if err != nil {
			// implies a serious bug
			panic(fmt.Sprintf("could not set token session information: %v", err))
		}
	}
	pd.CommandAccessToken = pd.LoginInfo.AccessToken()
	win32.DumpTokenInfo(pd.LoginInfo.AccessToken())
}

func GrantSIDWinstaAccess(sid string, pd *PlatformData) {
	// no need to grant if already granted
	if sidsThatCanControlDesktopAndWindowsStation[sid] {
		log.Printf("SID %v found in %#v - no need to grant access!", sid, sidsThatCanControlDesktopAndWindowsStation)
	} else {
		log.Printf("SID %v NOT found in %#v - granting access...", sid, sidsThatCanControlDesktopAndWindowsStation)

		cmd, err := NewCommand([]string{gwruntime.GenericWorkerBinary(), "grant-winsta-access", "--sid", sid}, ".", []string{}, pd)
		if err != nil {
			panic(err)
		}
		cmd.DirectOutput(os.Stdout)
		log.Printf("About to run command: %#v", *(cmd.Cmd))
		result := cmd.Execute()
		if !result.Succeeded() {
			panic(fmt.Sprintf("failed to grant everyone access to windows station and desktop:\n%v", result))
		}
		log.Printf("Granted %v full control of interactive windows station and desktop", sid)
		sidsThatCanControlDesktopAndWindowsStation[sid] = true
	}
}
