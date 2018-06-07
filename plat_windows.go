package main

import (
	"bufio"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	sysruntime "runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/dchest/uniuri"
	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/generic-worker/runtime"
	"github.com/taskcluster/runlib/subprocess"
	"github.com/taskcluster/runlib/win32"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

type TaskContext struct {
	TaskDir      string
	LogonSession *process.LogonSession
}

func platformFeatures() []Feature {
	return []Feature{
		&RDPFeature{},
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

func exceptionOrFailure(errCommand error) *CommandExecutionError {
	switch errCommand.(type) {
	case *exec.ExitError:
		return &CommandExecutionError{
			Cause:      errCommand,
			TaskStatus: failed,
		}
	}
	panic(errCommand)
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

func deleteTaskDir(path string) error {
	log.Print("Trying to remove directory '" + path + "' via os.RemoveAll(path) call as GenericWorker user...")
	err := os.RemoveAll(path)
	if err == nil {
		return nil
	}
	log.Print("WARNING: could not delete directory '" + path + "' with os.RemoveAll(path) method")
	log.Printf("%v", err)
	log.Print("Trying to remove directory '" + path + "' via del command as GenericWorker user...")
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
	taskContext.LogonSession = &process.LogonSession{
		User: &runtime.OSUser{
			Name: userName,
		},
	}
	if autoLogonUser, _ := AutoLogonCredentials(); userName == autoLogonUser {
		// make sure user has completed logon before doing anything else
		// timeout of 3 minutes should be plenty - note, this function will
		// return as soon as user has logged in *and* user profile directory
		// has been created - the timeout just sets an upper cap
		hToken, err := win32.InteractiveUserToken(3 * time.Minute)
		if err != nil {
			panic(err)
		}
		loginInfo := &subprocess.LoginInfo{
			HUser: hToken,
		}
		// At this point, we know we have already booted into the new task user, and the user
		// is logged in.
		// Note we don't create task directory before logging in, since
		// if the task directory is also the user profile home, this
		// would mess up the windows logon process.
		err = os.MkdirAll(taskContext.TaskDir, 0777)
		if err != nil {
			panic(err)
		}
		if script := config.RunAfterUserCreation; script != "" {
			command, err := process.NewCommand([]string{script}, taskContext.TaskDir, nil, loginInfo)
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
		return false
	}
	// create user
	user := &runtime.OSUser{
		Name:     userName,
		Password: generatePassword(),
	}
	err := user.CreateNew()
	if err != nil {
		panic(err)
	}
	// set APPDATA
	var loginInfo *subprocess.LoginInfo
	loginInfo, err = subprocess.NewLoginInfo(user.Name, user.Password)
	if err != nil {
		panic(err)
	}
	err = RedirectAppData(loginInfo.HUser, filepath.Join(taskContext.TaskDir, "AppData"))
	// KeepAlive needed so that user isn't logged out before redirect completes
	sysruntime.KeepAlive(loginInfo)
	if err != nil {
		panic(err)
	}
	// configure worker to auto-login to this newly generated user account
	err = SetAutoLogin(user)
	if err != nil {
		panic(err)
	}
	log.Print("Exiting worker so it can reboot...")
	return true
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

func deleteExistingOSUsers() {
	log.Print("Looking for existing task users to delete...")
	err := processCommandOutput(deleteOSUserAccount, "wmic", "useraccount", "get", "name")
	if err != nil {
		log.Print("WARNING: could not list existing Windows user accounts")
		log.Printf("%v", err)
	}
}

func deleteOSUserAccount(line string) {
	if strings.HasPrefix(line, "task_") {
		if autoLogonUser, _ := AutoLogonCredentials(); line != autoLogonUser {
			user := line
			log.Print("Attempting to remove Windows user " + user + "...")
			err := runtime.RunCommands(false, []string{"net", "user", user, "/delete"})
			if err != nil {
				log.Print("WARNING: Could not remove Windows user account " + user)
				log.Printf("%v", err)
			}
		}
	}
}

func (task *TaskRun) generateCommand(index int) error {
	commandName := fmt.Sprintf("command_%06d", index)
	wrapper := filepath.Join(taskContext.TaskDir, commandName+"_wrapper.bat")
	log.Printf("Creating wrapper script: %v", wrapper)
	loginInfo, err := TaskUserLoginInfo()
	if err != nil {
		task.Errorf("Cannot get handle of interactive user: %v", err)
		return err
	}
	command, err := process.NewCommand([]string{wrapper}, taskContext.TaskDir, nil, loginInfo)
	if err != nil {
		return err
	}
	task.logMux.RLock()
	defer task.logMux.RUnlock()
	command.DirectOutput(task.logWriter)
	task.Commands[index] = command
	return nil
}

func TaskUserLoginInfo() (loginInfo *subprocess.LoginInfo, err error) {
	loginInfo = &subprocess.LoginInfo{}
	if !config.RunTasksAsCurrentUser {
		var hToken syscall.Handle
		hToken, err = win32.InteractiveUserToken(time.Minute)
		if err != nil {
			return
		}
		loginInfo.HUser = hToken
	}
	return
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
		0755,
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
		0755,
	)

	// log.Printf("Script %q:", script)
	// log.Print("Contents:")
	// log.Print(string(fileContents))

	// log.Printf("Wrapper script %q:", wrapper)
	// log.Print("Contents:")
	// log.Print(contents)

	if err != nil {
		panic(err)
	}
	return nil
}

func taskCleanup() error {
	if config.CleanUpTaskDirs {
		deleteTaskDirs()
	}
	// note if this fails, we carry on without throwing an error
	if !config.RunTasksAsCurrentUser {
		deleteExistingOSUsers()
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
		dir := filepath.Dir(exePath)
		return deployService(configFile, nssm, serviceName, exePath, dir)
	}
	log.Fatal("Unknown install target - only 'service' is allowed")
	return nil
}

func CreateRunGenericWorkerBatScript(batScriptFilePath string) error {
	batScriptContents := []byte(strings.Join([]string{
		`:: Run generic-worker`,
		``,
		`:: step inside folder containing this script`,
		`pushd %~dp0`,
		``,
		`.\generic-worker.exe run --configure-for-aws > .\generic-worker.log 2>&1`,
		``,
		`:: Possible exit codes:`,
		`::    0: all tasks completed   - only occurs when numberOfTasksToRun > 0`,
		`::   67: rebooting             - system reboot has been triggered`,
		`::   68: idle timeout          - system shutdown has been triggered if shutdownMachineOnIdle=true`,
		`::   69: internal error        - system shutdown has been triggered if shutdownMachineOnInternalError=true`,
		`::   70: deployment ID changed - system shutdown has been triggered`,
		``,
	}, "\r\n"))
	err := ioutil.WriteFile(batScriptFilePath, batScriptContents, 0755)
	if err != nil {
		return fmt.Errorf("Was not able to create file %q with access permissions 0755 due to %s", batScriptFilePath, err)
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
func deployService(configFile, nssm, serviceName, exePath, dir string) error {
	targetScript := filepath.Join(filepath.Dir(exePath), "run-generic-worker.bat")
	err := CreateRunGenericWorkerBatScript(targetScript)
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
	if config.RunTasksAsCurrentUser {
		return nil
	}
	task.Infof("[mounts] Granting %v full control of '%v'", taskContext.LogonSession.User.Name, dir)
	err := runtime.RunCommands(
		false,
		[]string{"icacls", dir, "/grant:r", taskContext.LogonSession.User.Name + ":(OI)(CI)F"},
	)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make directory %v writable for %v: %v", dir, taskContext.LogonSession.User.Name, err)
	}
	return nil
}

// see http://ss64.com/nt/icacls.html
func makeDirUnreadable(task *TaskRun, dir string) error {
	if config.RunTasksAsCurrentUser {
		return nil
	}
	task.Infof("[mounts] Denying %v access to '%v'", taskContext.LogonSession.User.Name, dir)
	err := runtime.RunCommands(
		false,
		[]string{"icacls", dir, "/remove:g", taskContext.LogonSession.User.Name},
	)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make directory %v unreadable for %v: %v", dir, taskContext.LogonSession.User.Name, err)
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

func (task *TaskRun) addGroupsToUser(groups []string) error {
	if len(groups) == 0 {
		return nil
	}
	commands := make([][]string, len(groups), len(groups))
	for i, group := range groups {
		commands[i] = []string{"net", "localgroup", group, "/add", taskContext.LogonSession.User.Name}
	}
	return runtime.RunCommands(false, commands...)
}

func RedirectAppData(hUser syscall.Handle, folder string) (err error) {
	err = win32.SetAndCreateFolder(hUser, &win32.FOLDERID_RoamingAppData, filepath.Join(folder, "Roaming"))
	if err != nil {
		return
	}
	return win32.SetAndCreateFolder(hUser, &win32.FOLDERID_LocalAppData, filepath.Join(folder, "Local"))
}

func defaultTasksDir() string {
	return win32.ProfilesDirectory()
}

func AutoLogonCredentials() (username, password string) {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`, registry.QUERY_VALUE)
	if err != nil {
		log.Printf("Hit error reading Winlogon registry key - assume no autologon set: %v", err)
		return
	}
	defer k.Close()
	username, _, err = k.GetStringValue("DefaultUserName")
	if err != nil {
		log.Printf("Hit error reading winlogon DefaultUserName registry value - assume no autologon set: %v", err)
		return "", ""
	}
	password, _, err = k.GetStringValue("DefaultPassword")
	if err != nil {
		log.Printf("Hit error reading winlogon DefaultPassword registry value - assume no autologon set: %v", err)
		return "", ""
	}
	return
}

func chooseTaskDirName() string {
	taskDirName, _ := AutoLogonCredentials()
	if taskDirName == "" {
		return "task_" + strconv.Itoa(int(time.Now().Unix()))
	}
	return taskDirName
}

func unsetAutoLogon() {
	err := SetAutoLogin(
		&runtime.OSUser{},
	)
	if err != nil {
		panic(err)
	}
}

func deleteTaskDirs() {
	removeTaskDirs(win32.ProfilesDirectory())
	removeTaskDirs(config.TasksDir)
}
