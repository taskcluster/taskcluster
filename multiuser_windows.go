// +build multiuser

package main

import (
	"bufio"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	stdlibruntime "runtime"
	"strconv"
	"strings"
	"syscall"

	"github.com/taskcluster/generic-worker/host"
	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/generic-worker/runtime"
	gwruntime "github.com/taskcluster/generic-worker/runtime"
	"github.com/taskcluster/generic-worker/win32"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

func (task *TaskRun) formatCommand(index int) string {
	return task.Payload.Command[index]
}

func platformFeatures() []Feature {
	return []Feature{
		&RDPFeature{},
		&RunAsAdministratorFeature{}, // depends on (must appear later in list than) OSGroups feature
		// keep chain of trust as low down as possible, as it checks permissions
		// of signing key file, and a feature could change them, so we want these
		// checks as late as possible
		&ChainOfTrustFeature{},
	}
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
	err = host.Run("cmd", "/c", "del", "/s", "/q", "/f", path)
	if err != nil {
		log.Printf("%#v", err)
	}
	return err
}

func (task *TaskRun) generateCommand(index int) error {
	commandName := fmt.Sprintf("command_%06d", index)
	wrapper := filepath.Join(taskContext.TaskDir, commandName+"_wrapper.bat")
	log.Printf("Creating wrapper script: %v", wrapper)
	command, err := process.NewCommand([]string{wrapper}, taskContext.TaskDir, nil, taskContext.pd)
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
		if config.RunTasksAsCurrentUser {
			contents += "set TASK_USER_CREDENTIALS=" + filepath.Join(cwd, "current-task-user.json") + "\r\n"
		}
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

func makeFileOrDirReadWritableForUser(recurse bool, dir string, user *gwruntime.OSUser) error {
	// see http://ss64.com/nt/icacls.html
	return host.Run("icacls", dir, "/grant:r", user.Name+":(OI)(CI)F")
}

func makeDirUnreadableForUser(dir string, user *gwruntime.OSUser) error {
	// see http://ss64.com/nt/icacls.html
	return host.Run("icacls", dir, "/remove:g", user.Name)
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
		err := host.Run("net", "localgroup", group, "/add", taskContext.User.Name)
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
		err := host.Run("net", "localgroup", group, "/delete", taskContext.User.Name)
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

func rebootBetweenTasks() bool {
	return true
}

func platformTargets(arguments map[string]interface{}) ExitCode {
	switch {
	case arguments["grant-winsta-access"]:
		sid := arguments["--sid"].(string)
		err := GrantSIDFullControlOfInteractiveWindowsStationAndDesktop(sid)
		if err != nil {
			log.Printf("Error granting %v full control of interactive windows station and desktop:", sid)
			log.Printf("%v", err)
			return CANT_GRANT_CONTROL_OF_WINSTA_AND_DESKTOP
		}
		return 0
	}
	log.Print("Internal error - no target found to run, yet command line parsing successful")
	return INTERNAL_ERROR
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
	return host.RunBatch(
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

func PreRebootSetup(nextTaskUser *runtime.OSUser) {
	// set APPDATA
	var loginInfo *process.LoginInfo
	var err error
	loginInfo, err = process.NewLoginInfo(nextTaskUser.Name, nextTaskUser.Password)
	if err != nil {
		panic(err)
	}
	err = RedirectAppData(loginInfo.AccessToken(), filepath.Join(config.TasksDir, nextTaskUser.Name, "AppData"))
	if err != nil {
		panic(err)
	}
	err = loginInfo.Release()
	if err != nil {
		panic(err)
	}
}

func MkdirAllTaskUser(dir string, perms os.FileMode) (err error) {
	return os.MkdirAll(dir, perms)
}
