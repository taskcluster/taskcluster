package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/dchest/uniuri"
	"github.com/taskcluster/generic-worker/process"
	"github.com/taskcluster/generic-worker/runtime"
	"github.com/taskcluster/ntr"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
	"golang.org/x/text/encoding/unicode"
)

type TaskContext struct {
	TaskDir        string
	DesktopSession *process.DesktopSession
}

func immediateShutdown(cause string) {
	if config.ShutdownMachineOnInternalError {
		cmd := exec.Command("C:\\Windows\\System32\\shutdown.exe", "/s", "/t", "60", "/c", cause)
		err := cmd.Run()
		if err != nil {
			log.Fatal(err)
		}
	}
	os.Exit(64)
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

func startup() error {
	log.Print("Detected Windows platform...")
	return taskCleanup()
}

func deleteTaskDir(path string, user string) error {
	if !config.CleanUpTaskDirs {
		log.Print("*NOT* Removing home directory '" + path + "' as 'cleanUpTaskDirs' is set to 'false' in generic worker config...")
		return nil
	}

	log.Print("Trying to remove directory '" + path + "' via os.RemoveAll(path) call as GenericWorker runtime...")
	err := os.RemoveAll(path)
	if err == nil {
		return nil
	}
	log.Print("WARNING: could not delete directory '" + path + "' with os.RemoveAll(path) method")
	log.Printf("%v", err)
	log.Print("Trying to remove directory '" + path + "' via del command as GenericWorker runtime...")
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

func prepareTaskEnvironment() error {
	// delete old task user first...
	if taskContext.DesktopSession != nil {
		err := taskContext.DesktopSession.Desktop.Close()
		if err != nil {
			return fmt.Errorf("Could not create new task user because previous task user's desktop could not be closed:\n%v", err)
		}
	} else {
		log.Print("No previous task user desktop, so no need to close any open desktops")
	}
	if !config.RunTasksAsCurrentUser {
		// username can only be 20 chars, uuids are too long, therefore use
		// prefix (5 chars) plus seconds since epoch (10 chars) note, if we run
		// as current user, we don't want a task_* subdirectory, we want to run
		// from same directory every time. Also important for tests.
		userName := "task_" + strconv.Itoa((int)(time.Now().Unix()))
		taskContext = &TaskContext{
			TaskDir: filepath.Join(config.TasksDir, userName),
		}
		// create user
		user := &runtime.OSUser{
			Name:     userName,
			Password: generatePassword(),
		}
		err := user.CreateNew()
		if err != nil {
			return err
		}
		// create desktop and login
		loginInfo, desktop, err := process.NewDesktopSession(taskContext.DesktopSession.User.Name, taskContext.DesktopSession.User.Password)
		if err != nil {
			return err
		}
		taskContext.DesktopSession = &process.DesktopSession{
			User:      user,
			LoginInfo: loginInfo,
			Desktop:   desktop,
		}
	} else {
		taskContext = &TaskContext{
			TaskDir: config.TasksDir,
		}
	}
	return os.MkdirAll(filepath.Join(taskContext.TaskDir, "public", "logs"), 0777)
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
	deleteTaskDirs()
	log.Print("Looking for existing task users to delete...")
	err := processCommandOutput(deleteOSUserAccount, "wmic", "useraccount", "get", "name")
	if err != nil {
		log.Print("WARNING: could not list existing Windows user accounts")
		log.Printf("%v", err)
	}
}

func deleteTaskDirs() {
	taskDirsParent, err := os.Open(config.TasksDir)
	if err != nil {
		log.Print("WARNING: Could not open " + config.TasksDir + " directory to find old home directories to delete")
		log.Printf("%v", err)
		return
	}
	defer taskDirsParent.Close()
	fi, err := taskDirsParent.Readdir(-1)
	if err != nil {
		log.Print("WARNING: Could not read complete directory listing to find old home directories to delete")
		log.Printf("%v", err)
		// don't return, since we may have partial listings
	}
	for _, file := range fi {
		if file.IsDir() {
			if fileName := file.Name(); strings.HasPrefix(fileName, "task_") {
				path := filepath.Join(config.TasksDir, fileName)
				// fileName could be <user> or <user>.<hostname>...
				user := fileName
				if i := strings.IndexRune(user, '.'); i >= 0 {
					user = user[:i]
				}
				// ignore any error occuring here, not a lot we can do about it...
				deleteTaskDir(path, user)
			}
		}
	}

}

func deleteOSUserAccount(line string) {
	if strings.HasPrefix(line, "task_") {
		user := line
		log.Print("Attempting to remove Windows user " + user + "...")
		err := runtime.RunCommands(false, []string{"net", "user", user, "/delete"})
		if err != nil {
			log.Print("WARNING: Could not remove Windows user account " + user)
			log.Printf("%v", err)
		}
	}
}

func (task *TaskRun) generateCommand(index int) error {
	commandName := fmt.Sprintf("command_%06d", index)
	wrapper := filepath.Join(taskContext.TaskDir, commandName+"_wrapper.bat")
	log.Printf("Creating wrapper script: %v", wrapper)
	command, err := process.NewCommand(wrapper, &taskContext.TaskDir, nil, task.maxRunTimeDeadline, taskContext.DesktopSession)
	if err != nil {
		return err
	}
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
	// runtime.

	// If this is first command, take env from task payload, and cd into home
	// directory
	if index == 0 {
		envVars := map[string]string{}
		if task.Payload.Env != nil {
			err := json.Unmarshal(task.Payload.Env, &envVars)
			if err != nil {
				return MalformedPayloadError(err)
			}
			for envVar, envValue := range envVars {
				// log.Printf("Setting env var: %v=%v", envVar, envValue)
				contents += "set " + envVar + "=" + envValue + "\r\n"
			}
		}
		contents += "set TASK_ID=" + task.TaskID + "\r\n"
		contents += "cd \"" + taskContext.TaskDir + "\"" + "\r\n"

		// Otherwise get the env from the previous command
	} else {
		for _, x := range [2][2]string{{env, "set "}, {dir, "cd "}} {
			file, err := os.Open(x[0])
			if err != nil {
				panic(err)
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
		"@echo off",
	}, "\r\n"))

	err = ioutil.WriteFile(
		script,
		fileContents,
		0755,
	)

	log.Printf("Script %q:", script)
	log.Print("Contents:")
	log.Print(string(fileContents))

	if err != nil {
		panic(err)
	}
	return nil
}

func taskCleanup() error {
	// note if this fails, we carry on without throwing an error
	if !config.RunTasksAsCurrentUser {
		deleteExistingOSUsers()
	}
	// this needs to succeed, so return an error if it doesn't
	err := prepareTaskEnvironment()
	if err != nil {
		return err
	}
	return nil
}

func install(arguments map[string]interface{}) (err error) {
	exePath, err := ExePath()
	if err != nil {
		return err
	}
	configFile := convertNilToEmptyString(arguments["--config"])
	username := convertNilToEmptyString(arguments["--username"])
	password := convertNilToEmptyString(arguments["--password"])
	if password == "" {
		password = generatePassword()
	}
	user := &runtime.OSUser{
		Name:     username,
		Password: password,
	}
	fmt.Println("User: " + user.Name + ", Password: " + user.Password)

	err = user.EnsureCreated()
	if err != nil {
		return err
	}
	err = user.MakeAdmin()
	if err != nil {
		return err
	}
	err = ntr.AddPrivilegesToUser(username, ntr.SE_ASSIGNPRIMARYTOKEN_NAME)
	// err = ntr.AddPrivilegesToUser(username, "SeAssignPrimaryTokenPrivilege", "SeIncreaseQuotaPrivilege")
	if err != nil {
		return err
	}
	switch {
	case arguments["service"]:
		nssm := convertNilToEmptyString(arguments["--nssm"])
		serviceName := convertNilToEmptyString(arguments["--service-name"])
		dir := filepath.Dir(exePath)
		return deployService(user, configFile, nssm, serviceName, exePath, dir)
	case arguments["startup"]:
		return deployStartup(user, configFile, exePath)
	}
	log.Fatal("Unknown install target - neither 'service' nor 'startup' have been specified")
	return nil
}

func deployStartup(user *runtime.OSUser, configFile string, exePath string) error {
	scheduledTaskUTF8 := []byte(strings.Replace(`<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Date>2016-04-28T17:25:08.4654422</Date>
    <Author>GenericWorker</Author>
    <Description>Runs the generic worker.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>GenericWorker</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>GenericWorker</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>true</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>true</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>3</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>C:\generic-worker\run-generic-worker.bat</Command>
    </Exec>
  </Actions>
</Task>`, "\n", "\r\n", -1))
	utf16Encoder := unicode.UTF16(unicode.LittleEndian, unicode.UseBOM).NewEncoder()
	scheduledTaskUTF16, err := utf16Encoder.Bytes(scheduledTaskUTF8)
	if err != nil {
		return fmt.Errorf("INTERNAL ERROR: Could not UTF16-encode (static) scheduled task: %s\n\nError received: %s", scheduledTaskUTF8, err)
	}
	xmlFilePath := filepath.Join(filepath.Dir(exePath), "Run Generic Worker.xml")
	err = ioutil.WriteFile(xmlFilePath, scheduledTaskUTF16, 0644)
	if err != nil {
		return fmt.Errorf("I was not able to write the file \"Run Generic Worker.xml\" to file location %q with 0644 permissions, due to: %s", xmlFilePath, err)
	}
	err = runtime.RunCommands(false, []string{"schtasks", "/create", "/tn", "Run Generic Worker on login", "/xml", xmlFilePath})
	if err != nil {
		return fmt.Errorf("Not able to schedule task \"Run Generic Worker on login\" using schtasks command, due to error: %s\n\nAlso see stderr/stdout logs for output of the command that failed.", err)
	}
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

	batScriptFilePath := filepath.Join(filepath.Dir(exePath), "run-generic-worker.bat")
	batScriptContents := []byte(strings.Join([]string{
		`:: run the generic worker`,
		``,
		`:: cd to folder containing this script`,
		`pushd %~dp0`,
		``,
		`.\generic-worker.exe run --configure-for-aws > .\generic-worker.log 2>&1`,
	}, "\r\n"))
	err = ioutil.WriteFile(batScriptFilePath, batScriptContents, 0755)
	if err != nil {
		return fmt.Errorf("Was not able to create file %q with access permissions 0755 due to %s", batScriptFilePath, err)
	}
	return nil
}

// deploys the generic worker as a windows service, running under the windows
// user specified with username/password, such that the generic worker runs
// with the given configuration file configFile. the http://nssm.cc/ executable
// is required to install the service, specified as a file system path. The
// serviceName is the service name given to the newly created service. if the
// service already exists, it is simply updated.
func deployService(user *runtime.OSUser, configFile, nssm, serviceName, exePath, dir string) error {
	return runtime.RunCommands(
		false,
		[]string{nssm, "install", serviceName, exePath},
		[]string{nssm, "set", serviceName, "AppDirectory", dir},
		[]string{nssm, "set", serviceName, "AppParameters", "--config", configFile, "--configure-for-aws", "run"},
		[]string{nssm, "set", serviceName, "DisplayName", serviceName},
		[]string{nssm, "set", serviceName, "Description", "A taskcluster worker that runs on all mainstream platforms"},
		[]string{nssm, "set", serviceName, "Start", "SERVICE_AUTO_START"},
		[]string{nssm, "set", serviceName, "ObjectName", ".\\" + user.Name, user.Password},
		[]string{nssm, "set", serviceName, "Type", "SERVICE_WIN32_OWN_PROCESS"},
		[]string{nssm, "set", serviceName, "AppPriority", "NORMAL_PRIORITY_CLASS"},
		[]string{nssm, "set", serviceName, "AppNoConsole", "1"},
		[]string{nssm, "set", serviceName, "AppAffinity", "All"},
		[]string{nssm, "set", serviceName, "AppStopMethodSkip", "0"},
		[]string{nssm, "set", serviceName, "AppStopMethodConsole", "1500"},
		[]string{nssm, "set", serviceName, "AppStopMethodWindow", "1500"},
		[]string{nssm, "set", serviceName, "AppStopMethodThreads", "1500"},
		[]string{nssm, "set", serviceName, "AppThrottle", "1500"},
		[]string{nssm, "set", serviceName, "AppExit", "Default", "Restart"},
		[]string{nssm, "set", serviceName, "AppRestartDelay", "0"},
		[]string{nssm, "set", serviceName, "AppStdout", filepath.Join(dir, "generic-worker.log")},
		[]string{nssm, "set", serviceName, "AppStderr", filepath.Join(dir, "generic-worker.log")},
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
func makeDirReadable(dir string) error {
	if config.RunTasksAsCurrentUser {
		return nil
	}
	return runtime.RunCommands(
		false,
		[]string{"icacls", dir, "/grant:r", taskContext.DesktopSession.User.Name + ":(OI)(CI)F"},
	)
}

// see http://ss64.com/nt/icacls.html
func makeDirUnreadable(dir string) error {
	if taskContext.DesktopSession == nil {
		return nil
	}
	return runtime.RunCommands(
		false,
		[]string{"icacls", dir, "/remove:g", taskContext.DesktopSession.User.Name},
	)
}

// The windows implementation of os.Rename(...) doesn't allow renaming files
// across drives (i.e. copy and delete semantics) - this alternative
// implementation is identical to the os.Rename(...) implementation, but
// additionally sets the flag windows.MOVEFILE_COPY_ALLOWED in order to cater
// for oldpath and newpath being on different drives. See:
// https://msdn.microsoft.com/en-us/library/windows/desktop/aa365240(v=vs.85).aspx
func RenameCrossDevice(oldpath, newpath string) error {
	from, err := syscall.UTF16PtrFromString(oldpath)
	if err != nil {
		return err
	}
	to, err := syscall.UTF16PtrFromString(newpath)
	if err != nil {
		return err
	}
	return windows.MoveFileEx(from, to, windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_COPY_ALLOWED)
}

func (task *TaskRun) addGroupsToUser(groups []string) error {
	if len(groups) == 0 {
		return nil
	}
	commands := make([][]string, len(groups), len(groups))
	for i, group := range groups {
		commands[i] = []string{"net", "localgroup", group, "/add", taskContext.DesktopSession.User.Name}
	}
	if config.RunTasksAsCurrentUser {
		task.Logf("Not adding user to groups %v since we are running as current runtime. Skipping following commands:", groups)
		for _, command := range commands {
			task.Logf("%#v", command)
		}
		return nil
	}
	return runtime.RunCommands(false, commands...)
}
