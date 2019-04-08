package main

import (
	"bufio"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	stdlibruntime "runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"github.com/dchest/uniuri"
	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/generic-worker/runtime"
	"github.com/taskcluster/generic-worker/win32"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

var sidsThatCanControlDesktopAndWindowsStation map[string]bool = map[string]bool{}

type PlatformData struct {
	CommandAccessToken syscall.Token
	LoginInfo          *process.LoginInfo
}

func (task *TaskRun) NewPlatformData() (pd *PlatformData, err error) {

	pd = &PlatformData{}
	if config.RunTasksAsCurrentUser {
		pd.LoginInfo = &process.LoginInfo{}
		return
	}
	pd.LoginInfo, err = process.InteractiveLoginInfo(3 * time.Minute)
	if err != nil {
		return
	}
	pd.CommandAccessToken = pd.LoginInfo.AccessToken()

	// This is the SID of "Everyone" group
	// TODO: we should probably change this to the logon SID of the user
	sid := "S-1-1-0"
	// no need to grant if already granted
	if sidsThatCanControlDesktopAndWindowsStation[sid] {
		log.Printf("SID %v found in %#v - no need to grant access!", sid, sidsThatCanControlDesktopAndWindowsStation)
	} else {
		log.Printf("SID %v NOT found in %#v - granting access...", sid, sidsThatCanControlDesktopAndWindowsStation)

		// We want to run generic-worker exe, which is os.Args[0] if we are running generic-worker, but if
		// we are running tests, os.Args[0] will be the test executable, so then we use relative path to
		// installed binary. This hack will go if we can use ImpersonateLoggedOnUser / RevertToSelf instead.
		var exe string
		if filepath.Base(os.Args[0]) == "generic-worker.exe" {
			exe = os.Args[0]
		} else {
			exe = `..\..\..\..\bin\generic-worker.exe`
		}
		cmd, err := process.NewCommand([]string{exe, "grant-winsta-access", "--sid", sid}, cwd, []string{}, pd.LoginInfo.AccessToken())
		cmd.DirectOutput(os.Stdout)
		log.Printf("About to run command: %#v", *(cmd.Cmd))
		if err != nil {
			panic(err)
		}
		result := cmd.Execute()
		if !result.Succeeded() {
			panic(fmt.Sprintf("Failed to grant everyone access to windows station and desktop:\n%v", result))
		}
		log.Printf("Granted %v full control of interactive windows station and desktop", sid)
		sidsThatCanControlDesktopAndWindowsStation[sid] = true
	}
	return
}

func (pd *PlatformData) ReleaseResources() error {
	pd.CommandAccessToken = 0
	return pd.LoginInfo.Release()
}

type TaskContext struct {
	TaskDir   string
	User      *runtime.OSUser
	LoginInfo *process.LoginInfo
}

func platformFeatures() []Feature {
	return []Feature{
		&RDPFeature{},
		&RunAsAdministratorFeature{}, // depends on (must appear later in list than) OSGroups feature
	}
}

func immediateReboot() {
	log.Println("Immediate reboot being issued...")
	cmd := exec.Command("C:\\Windows\\System32\\shutdown.exe", "/r", "/t", "3", "/c", "generic-worker requested reboot")
	err := cmd.Run()
	if err != nil {
		log.Fatal(err)
	}
}

func immediateShutdown(cause string) {
	log.Println("Immediate shutdown being issued...")
	log.Println(cause)
	cmd := exec.Command("C:\\Windows\\System32\\shutdown.exe", "/s", "/t", "3", "/c", cause)
	err := cmd.Run()
	if err != nil {
		log.Fatal(err)
	}
}

func processCommandOutput(callback func(line string), prog string, options ...string) error {
	out, err := exec.Command(prog, options...).Output()
	if err != nil {
		log.Printf("%v", err)
		return err
	}
	for _, line := range strings.Split(string(out), "\r\n") {
		trimmedLine := strings.Trim(line, "\r\n ")
		callback(trimmedLine)
	}
	return nil
}

func deleteDir(path string) error {
	log.Print("Trying to remove directory '" + path + "' via os.RemoveAll(path) call...")
	err := os.RemoveAll(path)
	if err == nil {
		return nil
	}
	log.Print("WARNING: could not delete directory '" + path + "' with os.RemoveAll(path) method")
	log.Printf("%v", err)
	log.Print("Trying to remove directory '" + path + "' via del command...")
	err = runtime.RunCommands(
		false,
		[]string{
			"cmd", "/c", "del", "/s", "/q", "/f", path,
		},
	)
	if err != nil {
		log.Printf("%#v", err)
	}
	return err
}

func prepareTaskUser(userName string) (reboot bool) {
	reboot = true
	if autoLogonUser := AutoLogonCredentials(); strings.HasPrefix(autoLogonUser.Name, "task_") {
		taskContext.User = &runtime.OSUser{
			Name:     autoLogonUser.Name,
			Password: autoLogonUser.Password,
		}
		// make sure user has completed logon before doing anything else
		// timeout of 3 minutes should be plenty - note, this function will
		// return as soon as user has logged in *and* user profile directory
		// has been created - the timeout just sets an upper cap
		accessToken, err := win32.InteractiveUserToken(3 * time.Minute)
		if err != nil {
			panic(err)
		}
		// At this point, we know we have already booted into the new task user, and the user
		// is logged in.
		// Note we don't create task directory before logging in, since
		// if the task directory is also the user profile home, this
		// would mess up the windows logon process.
		err = os.MkdirAll(taskContext.TaskDir, 0777) // note: 0777 is mostly ignored on windows
		if err != nil {
			panic(err)
		}
		// Make sure task user has full control of task directory. Due to
		// https://bugzilla.mozilla.org/show_bug.cgi?id=1439588#c38 we can't
		// assume previous MkdirAll has granted this permission.
		err = exec.Command("icacls", taskContext.TaskDir, "/grant", autoLogonUser.Name+":(OI)(CI)F").Run()
		if err != nil {
			panic(err)
		}
		if script := config.RunAfterUserCreation; script != "" {
			command, err := process.NewCommand([]string{script}, taskContext.TaskDir, nil, accessToken)
			if err != nil {
				panic(err)
			}
			command.DirectOutput(os.Stdout)
			result := command.Execute()
			log.Printf("%v", result)
			switch {
			case result.Failed():
				panic(result.FailureCause())
			case result.Crashed():
				panic(result.CrashCause())
			}
		}
		reboot = false

		// If there is precisely one more task to run, no need to create a
		// future task user, as we already have a task user created for the
		// current task, which we found in the Windows registry settings for
		// auto-logon.
		//
		// This also protects against generic-worker tests creating task users,
		// since in tests we always set NumberOfTasksToRun to 1. We don't want
		// tests to create OS users since the new users can only be used after
		// a reboot and we can't reboot mid-task in a CI test. Therefore we
		// allow the hosting generic-worker to create a single task user for
		// the CI task run, and the tests for the current CI task all use this
		// task user, whose credentials they find in the Windows logon regsitry
		// settings.
		if config.NumberOfTasksToRun == 1 {
			return false
		}
	}

	// Bug 1533694
	//
	// Create user for subsequent task run already, before we've run current
	// task, in case worker restarts unexpectedly during current task, due to
	// e.g. Blue Screen of Death.
	nextTaskUser := &runtime.OSUser{
		Name:     userName,
		Password: generatePassword(),
	}
	err := nextTaskUser.CreateNew()
	if err != nil {
		panic(err)
	}
	// set APPDATA
	var loginInfo *process.LoginInfo
	loginInfo, err = process.NewLoginInfo(nextTaskUser.Name, nextTaskUser.Password)
	if err != nil {
		panic(err)
	}
	err = RedirectAppData(loginInfo.AccessToken(), filepath.Join(taskContext.TaskDir, "AppData"))
	if err != nil {
		panic(err)
	}
	err = loginInfo.Release()
	if err != nil {
		panic(err)
	}
	// configure worker to auto-login to this newly generated user account
	err = SetAutoLogin(nextTaskUser)
	if err != nil {
		panic(err)
	}
	return reboot
}

// Uses [A-Za-z0-9] characters (default set) to avoid strange escaping problems
// that could potentially affect security. Prefixed with `pWd0_` to ensure
// password contains a special character (_), lowercase and uppercase letters,
// and a number. This is useful if the OS has a strict password policy
// requiring all of these. The total password length is 29 characters (24 of
// which are random). 29 characters should not be too long for the OS. The 24
// random characters of [A-Za-z0-9] provide (26+26+10)^24 possible permutations
// (approx 143 bits of randomness). Randomisation is not seeded, so results
// should not be reproducible.
func generatePassword() string {
	return "pWd0_" + uniuri.NewLen(24)
}

func deleteExistingOSUsers() error {
	log.Print("Looking for existing task users to delete...")
	err := processCommandOutput(deleteOSUserAccountIfOldTaskUser, "wmic", "useraccount", "get", "name")
	if err != nil {
		log.Print("WARNING: could not list existing Windows user accounts")
		log.Printf("%v", err)
	}
	return nil
}

func deleteOSUserAccountIfOldTaskUser(user string) {
	// filter out user accounts that aren't task accounts
	if !strings.HasPrefix(user, "task_") {
		return
	}
	// don't delete current task user account
	if user == taskContext.User.Name {
		return
	}
	// don't delete task user account for next task
	if user == AutoLogonCredentials().Name {
		return
	}
	// anything else is an old task user and can be deleted
	log.Print("Attempting to remove Windows user " + user + "...")
	err := runtime.RunCommands(false, []string{"net", "user", user, "/delete"})
	if err != nil {
		log.Print("WARNING: Could not remove Windows user account " + user)
		log.Printf("%v", err)
	}
}

func (task *TaskRun) generateCommand(index int) error {
	commandName := fmt.Sprintf("command_%06d", index)
	wrapper := filepath.Join(taskContext.TaskDir, commandName+"_wrapper.bat")
	log.Printf("Creating wrapper script: %v", wrapper)
	loginInfo := task.PlatformData.LoginInfo
	command, err := process.NewCommand([]string{wrapper}, taskContext.TaskDir, nil, loginInfo.AccessToken())
	if err != nil {
		return err
	}
	task.logMux.RLock()
	defer task.logMux.RUnlock()
	command.DirectOutput(task.logWriter)
	task.Commands[index] = command
	return nil
}

func (task *TaskRun) prepareCommand(index int) *CommandExecutionError {
	// In order that capturing of log files works, create a custom .bat file
	// for the task which redirects output to a log file...
	env := filepath.Join(taskContext.TaskDir, "env.txt")
	dir := filepath.Join(taskContext.TaskDir, "dir.txt")
	commandName := fmt.Sprintf("command_%06d", index)
	wrapper := filepath.Join(taskContext.TaskDir, commandName+"_wrapper.bat")
	script := filepath.Join(taskContext.TaskDir, commandName+".bat")
	contents := ":: This script runs command " + strconv.Itoa(index) + " defined in TaskId " + task.TaskID + "..." + "\r\n"
	contents += "@echo off\r\n"

	// At the end of each command we export all the env vars, and import them
	// at the start of the next command. Otherwise env variable changes would
	// be lost. Similarly, we store the current directory at the end of each
	// command, and cd into it at the beginning of the subsequent command. The
	// very first command takes the env settings from the payload, and the
	// current directory is set to the home directory of the newly created
	// user.

	// If this is first command, take env from task payload, and cd into home
	// directory
	if index == 0 {
		envVars := map[string]string{}
		for k, v := range task.Payload.Env {
			envVars[k] = v
		}
		for envVar, envValue := range envVars {
			// log.Printf("Setting env var: %v=%v", envVar, envValue)
			contents += "set " + envVar + "=" + envValue + "\r\n"
		}
		contents += "set TASK_ID=" + task.TaskID + "\r\n"
		contents += "set TASKCLUSTER_ROOT_URL=" + config.RootURL + "\r\n"
		contents += "cd \"" + taskContext.TaskDir + "\"" + "\r\n"

		// Otherwise get the env from the previous command
	} else {
		for _, x := range [2][2]string{{env, "set "}, {dir, "cd "}} {
			file, err := os.Open(x[0])
			if err != nil {
				panic(fmt.Errorf("Could not read from file %v\n%v", x[0], err))
			}
			defer file.Close()

			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				contents += x[1] + scanner.Text() + "\r\n"
			}

			if err := scanner.Err(); err != nil {
				panic(err)
			}
		}
	}

	// see http://blogs.msdn.com/b/oldnewthing/archive/2008/09/26/8965755.aspx
	// need to explicitly unset as we rely on it later
	contents += "set errorlevel=\r\n"

	// now make sure output is enabled again

	// now call the actual script that runs the command

	// ******************************
	// old version that WROTE TO A FILE:
	//      contents += "call " + script + " > " + absLogFile + " 2>&1" + "\r\n"
	// ******************************
	contents += "call " + script + " 2>&1" + "\r\n"
	contents += "@echo off" + "\r\n"

	// store exit code
	contents += "set tcexitcode=%errorlevel%\r\n"

	// now store env for next command, unless this is the last command
	if index != len(task.Payload.Command)-1 {
		contents += "set > " + env + "\r\n"
		contents += "cd > " + dir + "\r\n"
	}

	// exit with stored exit code
	contents += "exit /b %tcexitcode%\r\n"

	// now generate the .bat script that runs all of this
	err := ioutil.WriteFile(
		wrapper,
		[]byte(contents),
		0755, // note this is mostly ignored on windows
	)
	if err != nil {
		panic(err)
	}

	// Now make the actual task a .bat script
	fileContents := []byte(strings.Join([]string{
		"@echo on",
		task.Payload.Command[index],
	}, "\r\n"))

	err = ioutil.WriteFile(
		script,
		fileContents,
		0755, // note this is mostly ignored on windows
	)
	if err != nil {
		panic(err)
	}

	// log.Printf("Script %q:", script)
	// log.Print("Contents:")
	// log.Print(string(fileContents))

	// log.Printf("Wrapper script %q:", wrapper)
	// log.Print("Contents:")
	// log.Print(contents)

	return nil
}

// Set an environment variable in each command.  This can be called from a feature's
// NewTaskFeature method to set variables for the task.
func (task *TaskRun) setVariable(variable string, value string) error {
	for i := range task.Commands {
		newEnv := []string{fmt.Sprintf("%s=%s", variable, value)}
		combined, err := win32.MergeEnvLists(&task.Commands[i].Cmd.Env, &newEnv)
		if err != nil {
			return err
		}
		task.Commands[i].Cmd.Env = *combined
	}
	return nil
}

// Only return critical errors
func purgeOldTasks() error {
	if !config.CleanUpTaskDirs {
		log.Printf("WARNING: Not purging previous task directories/users since config setting cleanUpTaskDirs is false")
		return nil
	}
	err := deleteTaskDirs()
	if err != nil {
		log.Printf("Could not delete old task directories:\n%v", err)
		return err
	}
	// note if this fails, we carry on without throwing an error
	if !config.RunTasksAsCurrentUser {
		err = deleteExistingOSUsers()
		if err != nil {
			log.Printf("Could not delete old task users:\n%v", err)
			return err
		}
	}
	return nil
}

func install(arguments map[string]interface{}) (err error) {
	exePath, err := ExePath()
	if err != nil {
		return err
	}
	configFile := convertNilToEmptyString(arguments["--config"])
	switch {
	case arguments["service"]:
		nssm := convertNilToEmptyString(arguments["--nssm"])
		serviceName := convertNilToEmptyString(arguments["--service-name"])
		configureForAWS := arguments["--configure-for-aws"].(bool)
		configureForGCP := arguments["--configure-for-gcp"].(bool)
		dir := filepath.Dir(exePath)
		return deployService(configFile, nssm, serviceName, exePath, dir, configureForAWS, configureForGCP)
	}
	log.Fatal("Unknown install target - only 'service' is allowed")
	return nil
}

func CreateRunGenericWorkerBatScript(batScriptFilePath string, configureForAWS bool, configureForGCP bool) error {
	runCommand := `.\generic-worker.exe run`
	if configureForAWS {
		runCommand += ` --configure-for-aws`
	}
	if configureForGCP {
		runCommand += ` --configure-for-gcp`
	}
	runCommand += ` > .\generic-worker.log 2>&1`
	batScriptContents := []byte(strings.Join([]string{
		`:: Run generic-worker`,
		``,
		`:: step inside folder containing this script`,
		`pushd %~dp0`,
		``,
		runCommand,
		``,
		`:: Possible exit codes:`,
		`::    0: all tasks completed   - only occurs when numberOfTasksToRun > 0`,
		`::   67: rebooting             - system reboot has been triggered`,
		`::   68: idle timeout          - system shutdown has been triggered if shutdownMachineOnIdle=true`,
		`::   69: internal error        - system shutdown has been triggered if shutdownMachineOnInternalError=true`,
		`::   70: deployment ID changed - system shutdown has been triggered`,
		``,
	}, "\r\n"))
	err := ioutil.WriteFile(batScriptFilePath, batScriptContents, 0755) // note 0755 is mostly ignored on windows
	if err != nil {
		return fmt.Errorf("Was not able to create file %q due to %s", batScriptFilePath, err)
	}
	return nil
}

func SetAutoLogin(user *runtime.OSUser) error {
	k, _, err := registry.CreateKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`, registry.WRITE)
	if err != nil {
		return fmt.Errorf(`Was not able to create registry key 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' due to %s`, err)
	}
	defer k.Close()
	err = k.SetDWordValue("AutoAdminLogon", 1)
	if err != nil {
		return fmt.Errorf(`Was not able to set registry entry 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\AutoAdminLogon' to 1 due to %s`, err)
	}
	err = k.SetStringValue("DefaultUserName", user.Name)
	if err != nil {
		return fmt.Errorf(`Was not able to set registry entry 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\DefaultUserName' to %q due to %s`, user.Name, err)
	}
	err = k.SetStringValue("DefaultPassword", user.Password)
	if err != nil {
		return fmt.Errorf(`Was not able to set registry entry 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\DefaultPassword' to %q due to %s`, user.Password, err)
	}
	return nil
}

// deploys the generic worker as a windows service, running under the windows
// user specified with username/password, such that the generic worker runs
// with the given configuration file configFile. the http://nssm.cc/ executable
// is required to install the service, specified as a file system path. The
// serviceName is the service name given to the newly created service. if the
// service already exists, it is simply updated.
func deployService(configFile, nssm, serviceName, exePath, dir string, configureForAWS bool, configureForGCP bool) error {
	targetScript := filepath.Join(filepath.Dir(exePath), "run-generic-worker.bat")
	err := CreateRunGenericWorkerBatScript(targetScript, configureForAWS, configureForGCP)
	if err != nil {
		return err
	}
	return runtime.RunCommands(
		false,
		[]string{nssm, "install", serviceName, targetScript},
		[]string{nssm, "set", serviceName, "AppDirectory", dir},
		[]string{nssm, "set", serviceName, "DisplayName", serviceName},
		[]string{nssm, "set", serviceName, "Description", "A taskcluster worker that runs on all mainstream platforms"},
		[]string{nssm, "set", serviceName, "Start", "SERVICE_AUTO_START"},
		// By default, NSSM installs as LocalSystem, which we need since we call WTSQueryUserToken.
		// So let's not set it.
		// []string{nssm, "set", serviceName, "ObjectName", ".\\" + user.Name, user.Password},
		[]string{nssm, "set", serviceName, "Type", "SERVICE_WIN32_OWN_PROCESS"},
		[]string{nssm, "set", serviceName, "AppPriority", "NORMAL_PRIORITY_CLASS"},
		[]string{nssm, "set", serviceName, "AppNoConsole", "1"},
		[]string{nssm, "set", serviceName, "AppAffinity", "All"},
		[]string{nssm, "set", serviceName, "AppStopMethodSkip", "0"},
		[]string{nssm, "set", serviceName, "AppStopMethodConsole", "1500"},
		[]string{nssm, "set", serviceName, "AppStopMethodWindow", "1500"},
		[]string{nssm, "set", serviceName, "AppStopMethodThreads", "1500"},
		[]string{nssm, "set", serviceName, "AppThrottle", "1500"},
		[]string{nssm, "set", serviceName, "AppExit", "Default", "Exit"},
		[]string{nssm, "set", serviceName, "AppRestartDelay", "0"},
		[]string{nssm, "set", serviceName, "AppStdout", filepath.Join(dir, "generic-worker-service.log")},
		[]string{nssm, "set", serviceName, "AppStderr", filepath.Join(dir, "generic-worker-service.log")},
		[]string{nssm, "set", serviceName, "AppStdoutCreationDisposition", "4"},
		[]string{nssm, "set", serviceName, "AppStderrCreationDisposition", "4"},
		[]string{nssm, "set", serviceName, "AppRotateFiles", "1"},
		[]string{nssm, "set", serviceName, "AppRotateOnline", "1"},
		[]string{nssm, "set", serviceName, "AppRotateSeconds", "3600"},
		[]string{nssm, "set", serviceName, "AppRotateBytes", "0"},
	)
}

func ExePath() (string, error) {
	log.Printf("Command args: %#v", os.Args)
	prog := os.Args[0]
	p, err := filepath.Abs(prog)
	if err != nil {
		return "", err
	}
	fi, err := os.Stat(p)
	if err == nil {
		if !fi.Mode().IsDir() {
			return p, nil
		}
		err = fmt.Errorf("%s is directory", p)
	}
	if filepath.Ext(p) == "" {
		p += ".exe"
		fi, err = os.Stat(p)
		if err == nil {
			if !fi.Mode().IsDir() {
				return p, nil
			}
			err = fmt.Errorf("%s is directory", p)
		}
	}
	return "", err
}

func (task *TaskRun) formatCommand(index int) string {
	return task.Payload.Command[index]
}

// see http://ss64.com/nt/icacls.html
func makeDirReadableForTaskUser(task *TaskRun, dir string) error {
	// It doesn't concern us if config.RunTasksAsCurrentUser is set or not
	// because files inside task directory should be owned/managed by task user
	task.Infof("[mounts] Granting %v full control of '%v'", taskContext.User.Name, dir)
	err := runtime.RunCommands(
		false,
		[]string{"icacls", dir, "/grant:r", taskContext.User.Name + ":(OI)(CI)F"},
	)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make directory %v writable for %v: %v", dir, taskContext.User.Name, err)
	}
	return nil
}

// see http://ss64.com/nt/icacls.html
func makeDirUnreadableForTaskUser(task *TaskRun, dir string) error {
	// It doesn't concern us if config.RunTasksAsCurrentUser is set or not
	// because files inside task directory should be owned/managed by task user
	task.Infof("[mounts] Denying %v access to '%v'", taskContext.User.Name, dir)
	err := runtime.RunCommands(
		false,
		[]string{"icacls", dir, "/remove:g", taskContext.User.Name},
	)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make directory %v unreadable for %v: %v", dir, taskContext.User.Name, err)
	}
	return nil
}

// The windows implementation of os.Rename(...) doesn't allow renaming files
// across drives (i.e. copy and delete semantics) - this alternative
// implementation is identical to the os.Rename(...) implementation, but
// additionally sets the flag windows.MOVEFILE_COPY_ALLOWED in order to cater
// for oldpath and newpath being on different drives. See:
// https://msdn.microsoft.com/en-us/library/windows/desktop/aa365240(v=vs.85).aspx
func RenameCrossDevice(oldpath, newpath string) (err error) {
	var to, from *uint16
	from, err = syscall.UTF16PtrFromString(oldpath)
	if err != nil {
		return
	}
	to, err = syscall.UTF16PtrFromString(newpath)
	if err != nil {
		return
	}
	// this will work for files and directories on same drive, and even for
	// files on different drives, but not for directories on different drives
	err = windows.MoveFileEx(from, to, windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_COPY_ALLOWED)

	// if we fail, could be a folder that needs to be moved to a different
	// drive - however, check it really is a folder, since otherwise we could
	// end up infinitely recursing between RenameCrossDevice and
	// RenameFolderCrossDevice, since they both call into each other
	if err != nil {
		var fi os.FileInfo
		fi, err = os.Stat(oldpath)
		if err != nil {
			return
		}
		if fi.IsDir() {
			err = RenameFolderCrossDevice(oldpath, newpath)
		}
	}
	return
}

func RenameFolderCrossDevice(oldpath, newpath string) (err error) {
	// recursively move files
	moveFile := func(path string, info os.FileInfo, inErr error) (outErr error) {
		if inErr != nil {
			return inErr
		}
		var relPath string
		relPath, outErr = filepath.Rel(oldpath, path)
		if outErr != nil {
			return
		}
		targetPath := filepath.Join(newpath, relPath)
		if info.IsDir() {
			outErr = os.Mkdir(targetPath, info.Mode())
		} else {
			outErr = RenameCrossDevice(path, targetPath)
		}
		return
	}
	err = filepath.Walk(oldpath, moveFile)
	if err != nil {
		return
	}
	err = os.RemoveAll(oldpath)
	return
}

func (task *TaskRun) addUserToGroups(groups []string) (updatedGroups []string, notUpdatedGroups []string) {
	if len(groups) == 0 {
		return []string{}, []string{}
	}
	for _, group := range groups {
		err := runtime.RunCommands(false, []string{"net", "localgroup", group, "/add", taskContext.User.Name})
		if err == nil {
			updatedGroups = append(updatedGroups, group)
		} else {
			notUpdatedGroups = append(notUpdatedGroups, group)
		}
	}
	return
}

func (task *TaskRun) removeUserFromGroups(groups []string) (updatedGroups []string, notUpdatedGroups []string) {
	if len(groups) == 0 {
		return []string{}, []string{}
	}
	for _, group := range groups {
		err := runtime.RunCommands(false, []string{"net", "localgroup", group, "/delete", taskContext.User.Name})
		if err == nil {
			updatedGroups = append(updatedGroups, group)
		} else {
			notUpdatedGroups = append(notUpdatedGroups, group)
		}
	}
	return
}

func RedirectAppData(hUser syscall.Token, folder string) error {
	RoamingAppDataFolder := filepath.Join(folder, "Roaming")
	LocalAppDataFolder := filepath.Join(folder, "Local")
	err := win32.SetAndCreateFolder(hUser, &win32.FOLDERID_RoamingAppData, RoamingAppDataFolder)
	if err != nil {
		log.Printf("%v", err)
		log.Printf("WARNING: Not able to redirect Roaming App Data folder to %v - IGNORING!", RoamingAppDataFolder)
	}
	err = win32.SetAndCreateFolder(hUser, &win32.FOLDERID_LocalAppData, LocalAppDataFolder)
	if err != nil {
		log.Printf("%v", err)
		log.Printf("WARNING: Not able to redirect Local App Data folder to %v - IGNORING!", LocalAppDataFolder)
	}
	return nil
}

func defaultTasksDir() string {
	return win32.ProfilesDirectory()
}

func UACEnabled() bool {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	var enableLUA uint64
	enableLUA, _, err = k.GetIntegerValue("EnableLUA")
	if err != nil {
		return false
	}
	return enableLUA == 1
}

func AutoLogonCredentials() (user runtime.OSUser) {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`, registry.QUERY_VALUE)
	if err != nil {
		log.Printf("Hit error reading Winlogon registry key - assume no autologon set: %v", err)
		return
	}
	defer k.Close()
	user.Name, _, err = k.GetStringValue("DefaultUserName")
	if err != nil {
		log.Printf("Hit error reading winlogon DefaultUserName registry value - assume no autologon set: %v", err)
		return
	}
	user.Password, _, err = k.GetStringValue("DefaultPassword")
	if err != nil {
		log.Printf("Hit error reading winlogon DefaultPassword registry value - assume no autologon set: %v", err)
		return
	}
	return
}

func deleteTaskDirs() error {
	err := removeTaskDirs(win32.ProfilesDirectory())
	if err != nil {
		return err
	}
	return removeTaskDirs(config.TasksDir)
}

func (pd *PlatformData) RefreshLoginSession() {
	err := pd.LoginInfo.Release()
	if err != nil {
		panic(err)
	}
	user := taskContext.User.Name
	pass := taskContext.User.Password
	pd.LoginInfo, err = process.NewLoginInfo(user, pass)
	if err != nil {
		// implies a serious bug
		panic(err)
	}
	err = pd.LoginInfo.SetActiveConsoleSessionId()
	if err != nil {
		// implies a serious bug
		panic(fmt.Sprintf("Could not set token session information: %v", err))
	}
	pd.CommandAccessToken = pd.LoginInfo.AccessToken()
	DumpTokenInfo(pd.LoginInfo.AccessToken())
}

func DumpTokenInfo(token syscall.Token) {
	log.Print("==================================================")
	primaryGroup, err := token.GetTokenPrimaryGroup()
	if err != nil {
		panic(err)
	}
	account, domain, accType, err := primaryGroup.PrimaryGroup.LookupAccount("")
	if err != nil {
		panic(err)
	}
	primaryGroupSid, err := primaryGroup.PrimaryGroup.String()
	if err != nil {
		panic(err)
	}
	log.Printf("Token Primary Group (%v): %v/%v (%#x)", primaryGroupSid, account, domain, accType)
	tokenUser, err := token.GetTokenUser()
	if err != nil {
		panic(err)
	}
	tokenUserSid, err := tokenUser.User.Sid.String()
	if err != nil {
		panic(err)
	}
	account, domain, accType, err = tokenUser.User.Sid.LookupAccount("")
	if err != nil {
		panic(err)
	}
	log.Printf("Token User (%v): %v/%v (%#x) - with attributes: %#x", tokenUserSid, account, domain, accType, tokenUser.User.Attributes)
	tokenSessionID, err := win32.GetTokenSessionID(token)
	if err != nil {
		panic(err)
	}
	log.Printf("Token Session ID: %#x", tokenSessionID)
	tokenUIAccess, err := win32.GetTokenUIAccess(token)
	if err != nil {
		panic(err)
	}
	log.Printf("Token UI Access: %#x", tokenUIAccess)
	wt := windows.Token(token)
	tokenGroups, err := wt.GetTokenGroups()
	if err != nil {
		panic(err)
	}
	groups := make([]windows.SIDAndAttributes, tokenGroups.GroupCount, tokenGroups.GroupCount)
	for i := uint32(0); i < tokenGroups.GroupCount; i++ {
		groups[i] = *(*windows.SIDAndAttributes)(unsafe.Pointer(uintptr(unsafe.Pointer(&tokenGroups.Groups[0])) + uintptr(i)*unsafe.Sizeof(tokenGroups.Groups[0])))
		groupSid, err := groups[i].Sid.String()
		if err != nil {
			panic(fmt.Errorf("WEIRD: got error: %v", err))
		}
		account, domain, accType, err := groups[i].Sid.LookupAccount("")
		if err != nil {
			log.Printf("Token Group (%v): <<NO_SID>> - with attributes: %#x", groupSid, groups[i].Attributes)
		} else {
			log.Printf("Token Group (%v): %v/%v (%#x) - with attributes: %#x", groupSid, account, domain, accType, groups[i].Attributes)
		}
	}

	log.Print("==================================================")
}

func GrantSIDFullControlOfInteractiveWindowsStationAndDesktop(sid string) (err error) {

	stdlibruntime.LockOSThread()
	defer stdlibruntime.UnlockOSThread()

	var winsta win32.Hwinsta
	if winsta, err = win32.GetProcessWindowStation(); err != nil {
		return
	}

	var winstaName string
	winstaName, err = win32.GetUserObjectName(syscall.Handle(winsta))
	if err != nil {
		return
	}

	var desktop win32.Hdesk
	desktop, err = win32.GetThreadDesktop(win32.GetCurrentThreadId())
	if err != nil {
		return
	}

	var desktopName string
	desktopName, err = win32.GetUserObjectName(syscall.Handle(desktop))
	if err != nil {
		return
	}

	fmt.Printf("Windows Station:   %v\n", winstaName)
	fmt.Printf("Desktop:           %v\n", desktopName)

	var everyone *syscall.SID
	everyone, err = syscall.StringToSid(sid)
	if err != nil {
		return
	}

	err = win32.AddAceToWindowStation(winsta, everyone)
	if err != nil {
		return
	}

	err = win32.AddAceToDesktop(desktop, everyone)
	if err != nil {
		return
	}
	return
}

func rebootBetweenTasks() bool {
	return true
}

func removeTaskDirs(parentDir string) error {
	currentTaskUser := taskContext.User.Name
	nextTaskUser := AutoLogonCredentials().Name
	taskDirs, err := taskDirsIn(parentDir)
	if err != nil {
		return err
	}
	for _, taskDir := range taskDirs {
		name := filepath.Base(taskDir)
		if name != currentTaskUser && name != nextTaskUser {
			err = deleteDir(taskDir)
			if err != nil {
				return err
			}
		}
	}
	return nil
}
