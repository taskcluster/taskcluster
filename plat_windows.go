package main

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
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
	"github.com/taskcluster/ntr"
	"github.com/taskcluster/runlib/platform"
	"github.com/taskcluster/runlib/subprocess"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

type OSUser struct {
	TaskDir   string
	Name      string
	Password  string
	loginInfo *subprocess.LoginInfo
	desktop   *platform.ContesterDesktop
}

func immediateShutdown(cause string) {
	cmd := exec.Command("C:\\Windows\\System32\\shutdown.exe", "/s", "/t", "60", "/c", cause)
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

func startup() error {
	log.Print("Detected Windows platform...")
	return taskCleanup()
}

func deleteTaskDir(path string, user string) error {
	if !config.CleanUpTaskDirs {
		log.Print("*NOT* Removing home directory '" + path + "' as 'cleanUpTaskDirs' is set to 'false' in generic worker config...")
		return nil
	}

	log.Print("Trying to remove directory '" + path + "' via os.RemoveAll(path) call as GenericWorker user...")
	err := os.RemoveAll(path)
	if err == nil {
		return nil
	}
	log.Print("WARNING: could not delete directory '" + path + "' with os.RemoveAll(path) method")
	log.Printf("%v", err)
	log.Print("Trying to remove directory '" + path + "' via del command as GenericWorker user...")
	err = runCommands(
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

func createNewTaskUser() error {
	// delete old task user first...
	if TaskUser.desktop != nil {
		err := TaskUser.desktop.Close()
		if err != nil {
			return fmt.Errorf("Could not create new task user because previous task user's desktop could not be closed:\n%v", err)
		}
	} else {
		log.Print("No previous task user desktop, so no need to close any open desktops")
	}
	// username can only be 20 chars, uuids are too long, therefore
	// use prefix (5 chars) plus seconds since epoch (10 chars)
	userName := "task_" + strconv.Itoa((int)(time.Now().Unix()))
	password := generatePassword()
	TaskUser = &OSUser{
		TaskDir:  filepath.Join(config.TasksDir, userName),
		Name:     userName,
		Password: password,
	}
	err := TaskUser.createNewOSUser()
	if err != nil {
		return err
	}
	// create desktop and login
	loginInfo, desktop, err := process.NewDesktopSession(TaskUser.Name, TaskUser.Password)
	if err != nil {
		return err
	}
	TaskUser.loginInfo = loginInfo
	TaskUser.desktop = desktop

	return os.MkdirAll(filepath.Join(TaskUser.TaskDir, "public", "logs"), 0777)
}

func (user *OSUser) createNewOSUser() error {
	return user.createOSUserAccountForce(false)
}

func (user *OSUser) createOSUserAccountForce(okIfExists bool) error {
	log.Print("Creating Windows User " + user.Name + "...")
	userExisted, err := allowError(
		"The account already exists",
		"net", "user", user.Name, user.Password, "/add", "/expires:never", "/passwordchg:no", "/y",
	)
	if err != nil {
		return err
	}
	if !okIfExists && userExisted {
		return fmt.Errorf("User " + user.Name + " already existed - cannot create")
	}
	err = runCommands(
		userExisted,
		[]string{"wmic", "useraccount", "where", "name='" + user.Name + "'", "set", "passwordexpires=false"},
		[]string{"net", "localgroup", "Remote Desktop Users", "/add", user.Name},
	)
	// if user existed, the above commands can fail
	// if it didn't, they can't
	if !userExisted && err != nil {
		return err
	}
	if okIfExists {
		return nil
	}
	return err
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
		err := runCommands(false, []string{"net", "user", user, "/delete"})
		if err != nil {
			log.Print("WARNING: Could not remove Windows user account " + user)
			log.Printf("%v", err)
		}
	}
}

func (task *TaskRun) generateCommand(index int) error {
	commandName := fmt.Sprintf("command_%06d", index)
	wrapper := filepath.Join(TaskUser.TaskDir, commandName+"_wrapper.bat")
	command, err := process.NewCommand(wrapper, &TaskUser.TaskDir, nil, task.maxRunTimeDeadline, TaskUser.loginInfo, TaskUser.desktop)
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
	env := filepath.Join(TaskUser.TaskDir, "env.txt")
	dir := filepath.Join(TaskUser.TaskDir, "dir.txt")
	commandName := fmt.Sprintf("command_%06d", index)
	wrapper := filepath.Join(TaskUser.TaskDir, commandName+"_wrapper.bat")
	script := filepath.Join(TaskUser.TaskDir, commandName+".bat")
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
		contents += "cd \"" + TaskUser.TaskDir + "\"" + "\r\n"

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
	if config.RunTasksAsCurrentUser {
		err := os.MkdirAll(filepath.Join(TaskUser.TaskDir, "public", "logs"), 0700)
		if err != nil {
			return err
		}
		return nil
	}
	// note if this fails, we carry on without throwing an error
	deleteExistingOSUsers()
	// this needs to succeed, so return an error if it doesn't
	err := createNewTaskUser()
	if err != nil {
		return err
	}
	log.Print("Created new task user!")
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
	user := OSUser{
		Name:     username,
		Password: password,
		TaskDir:  filepath.Dir(exePath),
	}
	fmt.Println("User: " + user.Name + ", Password: " + user.Password + ", TaskDir: " + user.TaskDir)

	err = user.ensureUserAccount()
	if err != nil {
		return err
	}
	err = user.makeAdmin()
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
		return deployService(&user, configFile, nssm, serviceName, exePath)
	case arguments["startup"]:
		return deployStartup(&user, configFile, exePath)
	}
	log.Fatal("Unknown install target - neither 'service' nor 'startup' have been specified")
	return nil
}

// Runs command `command` with arguments `args`. If standard error from command
// includes `errString` then true, is returned with no error. Otherwise false
// is returned, with or without an error.
func allowError(errString string, command string, args ...string) (bool, error) {
	log.Print("Running command: '" + strings.Join(append([]string{command}, args...), "' '") + "'")
	cmd := exec.Command(command, args...)
	stderrBytes, err := Error(cmd)
	if err != nil {
		if strings.Contains(string(stderrBytes), errString) {
			return true, nil
		}
	}
	return false, err
}

func (user *OSUser) makeAdmin() error {
	_, err := allowError("The specified account name is already a member of the group", "net", "localgroup", "administrators", user.Name, "/add")
	return err
}

func (user *OSUser) ensureUserAccount() error {
	return user.createOSUserAccountForce(true)
}

func deployStartup(user *OSUser, configFile string, exePath string) error {
	// text is UTF-16, let's just treat as binary...
	encodedScheduledTask := "//48AD8AeABtAGwAIAB2AGUAcgBzAGkAbwBuAD0AIgAxAC4AMAAiACAAZQBuAGMAbwBkAGkAbgBnAD0AIgBVAFQARgAtADEANgAiAD8APgAKADwAVABhAHMAawAgAHYAZQByAHMAaQBvAG4APQAiADEALgAyACIAIAB4AG0AbABuAHMAPQAiAGgAdAB0AHAAOgAvAC8AcwBjAGgAZQBtAGEAcwAuAG0AaQBjAHIAbwBzAG8AZgB0AC4AYwBvAG0ALwB3AGkAbgBkAG8AdwBzAC8AMgAwADAANAAvADAAMgAvAG0AaQB0AC8AdABhAHMAawAiAD4ACgAgACAAPABSAGUAZwBpAHMAdAByAGEAdABpAG8AbgBJAG4AZgBvAD4ACgAgACAAIAAgADwARABhAHQAZQA+ADIAMAAxADYALQAwADQALQAyADgAVAAxADcAOgAyADUAOgAwADgALgA0ADYANQA0ADQAMgAyADwALwBEAGEAdABlAD4ACgAgACAAIAAgADwAQQB1AHQAaABvAHIAPgBHAGUAbgBlAHIAaQBjAFcAbwByAGsAZQByADwALwBBAHUAdABoAG8AcgA+AAoAIAAgACAAIAA8AEQAZQBzAGMAcgBpAHAAdABpAG8AbgA+AFIAdQBuAHMAIAB0AGgAZQAgAGcAZQBuAGUAcgBpAGMAIAB3AG8AcgBrAGUAcgAuADwALwBEAGUAcwBjAHIAaQBwAHQAaQBvAG4APgAKACAAIAA8AC8AUgBlAGcAaQBzAHQAcgBhAHQAaQBvAG4ASQBuAGYAbwA+AAoAIAAgADwAVAByAGkAZwBnAGUAcgBzAD4ACgAgACAAIAAgADwATABvAGcAbwBuAFQAcgBpAGcAZwBlAHIAPgAKACAAIAAgACAAIAAgADwARQBuAGEAYgBsAGUAZAA+AHQAcgB1AGUAPAAvAEUAbgBhAGIAbABlAGQAPgAKACAAIAAgACAAIAAgADwAVQBzAGUAcgBJAGQAPgBHAGUAbgBlAHIAaQBjAFcAbwByAGsAZQByADwALwBVAHMAZQByAEkAZAA+AAoAIAAgACAAIAA8AC8ATABvAGcAbwBuAFQAcgBpAGcAZwBlAHIAPgAKACAAIAA8AC8AVAByAGkAZwBnAGUAcgBzAD4ACgAgACAAPABQAHIAaQBuAGMAaQBwAGEAbABzAD4ACgAgACAAIAAgADwAUAByAGkAbgBjAGkAcABhAGwAIABpAGQAPQAiAEEAdQB0AGgAbwByACIAPgAKACAAIAAgACAAIAAgADwAVQBzAGUAcgBJAGQAPgBHAGUAbgBlAHIAaQBjAFcAbwByAGsAZQByADwALwBVAHMAZQByAEkAZAA+AAoAIAAgACAAIAAgACAAPABMAG8AZwBvAG4AVAB5AHAAZQA+AEkAbgB0AGUAcgBhAGMAdABpAHYAZQBUAG8AawBlAG4APAAvAEwAbwBnAG8AbgBUAHkAcABlAD4ACgAgACAAIAAgACAAIAA8AFIAdQBuAEwAZQB2AGUAbAA+AEgAaQBnAGgAZQBzAHQAQQB2AGEAaQBsAGEAYgBsAGUAPAAvAFIAdQBuAEwAZQB2AGUAbAA+AAoAIAAgACAAIAA8AC8AUAByAGkAbgBjAGkAcABhAGwAPgAKACAAIAA8AC8AUAByAGkAbgBjAGkAcABhAGwAcwA+AAoAIAAgADwAUwBlAHQAdABpAG4AZwBzAD4ACgAgACAAIAAgADwATQB1AGwAdABpAHAAbABlAEkAbgBzAHQAYQBuAGMAZQBzAFAAbwBsAGkAYwB5AD4ASQBnAG4AbwByAGUATgBlAHcAPAAvAE0AdQBsAHQAaQBwAGwAZQBJAG4AcwB0AGEAbgBjAGUAcwBQAG8AbABpAGMAeQA+AAoAIAAgACAAIAA8AEQAaQBzAGEAbABsAG8AdwBTAHQAYQByAHQASQBmAE8AbgBCAGEAdAB0AGUAcgBpAGUAcwA+AHQAcgB1AGUAPAAvAEQAaQBzAGEAbABsAG8AdwBTAHQAYQByAHQASQBmAE8AbgBCAGEAdAB0AGUAcgBpAGUAcwA+AAoAIAAgACAAIAA8AFMAdABvAHAASQBmAEcAbwBpAG4AZwBPAG4AQgBhAHQAdABlAHIAaQBlAHMAPgB0AHIAdQBlADwALwBTAHQAbwBwAEkAZgBHAG8AaQBuAGcATwBuAEIAYQB0AHQAZQByAGkAZQBzAD4ACgAgACAAIAAgADwAQQBsAGwAbwB3AEgAYQByAGQAVABlAHIAbQBpAG4AYQB0AGUAPgB0AHIAdQBlADwALwBBAGwAbABvAHcASABhAHIAZABUAGUAcgBtAGkAbgBhAHQAZQA+AAoAIAAgACAAIAA8AFMAdABhAHIAdABXAGgAZQBuAEEAdgBhAGkAbABhAGIAbABlAD4AZgBhAGwAcwBlADwALwBTAHQAYQByAHQAVwBoAGUAbgBBAHYAYQBpAGwAYQBiAGwAZQA+AAoAIAAgACAAIAA8AFIAdQBuAE8AbgBsAHkASQBmAE4AZQB0AHcAbwByAGsAQQB2AGEAaQBsAGEAYgBsAGUAPgBmAGEAbABzAGUAPAAvAFIAdQBuAE8AbgBsAHkASQBmAE4AZQB0AHcAbwByAGsAQQB2AGEAaQBsAGEAYgBsAGUAPgAKACAAIAAgACAAPABJAGQAbABlAFMAZQB0AHQAaQBuAGcAcwA+AAoAIAAgACAAIAAgACAAPABTAHQAbwBwAE8AbgBJAGQAbABlAEUAbgBkAD4AdAByAHUAZQA8AC8AUwB0AG8AcABPAG4ASQBkAGwAZQBFAG4AZAA+AAoAIAAgACAAIAAgACAAPABSAGUAcwB0AGEAcgB0AE8AbgBJAGQAbABlAD4AZgBhAGwAcwBlADwALwBSAGUAcwB0AGEAcgB0AE8AbgBJAGQAbABlAD4ACgAgACAAIAAgADwALwBJAGQAbABlAFMAZQB0AHQAaQBuAGcAcwA+AAoAIAAgACAAIAA8AEEAbABsAG8AdwBTAHQAYQByAHQATwBuAEQAZQBtAGEAbgBkAD4AdAByAHUAZQA8AC8AQQBsAGwAbwB3AFMAdABhAHIAdABPAG4ARABlAG0AYQBuAGQAPgAKACAAIAAgACAAPABFAG4AYQBiAGwAZQBkAD4AdAByAHUAZQA8AC8ARQBuAGEAYgBsAGUAZAA+AAoAIAAgACAAIAA8AEgAaQBkAGQAZQBuAD4AZgBhAGwAcwBlADwALwBIAGkAZABkAGUAbgA+AAoAIAAgACAAIAA8AFIAdQBuAE8AbgBsAHkASQBmAEkAZABsAGUAPgBmAGEAbABzAGUAPAAvAFIAdQBuAE8AbgBsAHkASQBmAEkAZABsAGUAPgAKACAAIAAgACAAPABXAGEAawBlAFQAbwBSAHUAbgA+AGYAYQBsAHMAZQA8AC8AVwBhAGsAZQBUAG8AUgB1AG4APgAKACAAIAAgACAAPABFAHgAZQBjAHUAdABpAG8AbgBUAGkAbQBlAEwAaQBtAGkAdAA+AFAAVAAwAFMAPAAvAEUAeABlAGMAdQB0AGkAbwBuAFQAaQBtAGUATABpAG0AaQB0AD4ACgAgACAAIAAgADwAUAByAGkAbwByAGkAdAB5AD4AMwA8AC8AUAByAGkAbwByAGkAdAB5AD4ACgAgACAAPAAvAFMAZQB0AHQAaQBuAGcAcwA+AAoAIAAgADwAQQBjAHQAaQBvAG4AcwAgAEMAbwBuAHQAZQB4AHQAPQAiAEEAdQB0AGgAbwByACIAPgAKACAAIAAgACAAPABFAHgAZQBjAD4ACgAgACAAIAAgACAAIAA8AEMAbwBtAG0AYQBuAGQAPgBDADoAXABnAGUAbgBlAHIAaQBjAC0AdwBvAHIAawBlAHIAXAByAHUAbgAtAGcAZQBuAGUAcgBpAGMALQB3AG8AcgBrAGUAcgAuAGIAYQB0ADwALwBDAG8AbQBtAGEAbgBkAD4ACgAgACAAIAAgADwALwBFAHgAZQBjAD4ACgAgACAAPAAvAEEAYwB0AGkAbwBuAHMAPgAKADwALwBUAGEAcwBrAD4ACgA="
	data, err := base64.StdEncoding.DecodeString(encodedScheduledTask)
	if err != nil {
		return fmt.Errorf("INTERNAL ERROR: Could not base64 decode (static) scheduled task: %s\n\nError received: %s", encodedScheduledTask, err)
	}
	xmlFilePath := filepath.Join(filepath.Dir(exePath), "Run Generic Worker.xml")
	err = ioutil.WriteFile(xmlFilePath, data, 0644)
	if err != nil {
		return fmt.Errorf("I was not able to write the file \"Run Generic Worker.xml\" to file location %q with 0644 permissions, due to: %s", xmlFilePath, err)
	}
	err = runCommands(false, []string{"schtasks", "/create", "/tn", "Run Generic Worker on login", "/xml", xmlFilePath})
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
func deployService(user *OSUser, configFile string, nssm string, serviceName string, exePath string) error {
	return runCommands(
		false,
		[]string{nssm, "install", serviceName, exePath},
		[]string{nssm, "set", serviceName, "AppDirectory", user.TaskDir},
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
		[]string{nssm, "set", serviceName, "AppStdout", filepath.Join(user.TaskDir, "generic-worker.log")},
		[]string{nssm, "set", serviceName, "AppStderr", filepath.Join(user.TaskDir, "generic-worker.log")},
		[]string{nssm, "set", serviceName, "AppStdoutCreationDisposition", "4"},
		[]string{nssm, "set", serviceName, "AppStderrCreationDisposition", "4"},
		[]string{nssm, "set", serviceName, "AppRotateFiles", "1"},
		[]string{nssm, "set", serviceName, "AppRotateOnline", "1"},
		[]string{nssm, "set", serviceName, "AppRotateSeconds", "3600"},
		[]string{nssm, "set", serviceName, "AppRotateBytes", "0"},
	)
}

func runCommands(allowFail bool, commands ...[]string) error {
	var err error
	for _, command := range commands {
		log.Print("Running command: '" + strings.Join(command, "' '") + "'")
		cmd := exec.Command(command[0], command[1:]...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		err = cmd.Run()

		if err != nil {
			log.Printf("%v", err)
			if !allowFail {
				return err
			}
		}
	}
	return err
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

// Error runs the command and returns its standard error.
func Error(c *exec.Cmd) ([]byte, error) {
	if c.Stderr != nil {
		return nil, errors.New("exec: Stderr already set")
	}
	var b bytes.Buffer
	c.Stderr = &b
	err := c.Run()
	return b.Bytes(), err
}

func (task *TaskRun) formatCommand(index int) string {
	return task.Payload.Command[index]
}

// see http://ss64.com/nt/icacls.html
func makeDirReadable(dir string) error {
	return runCommands(
		false,
		[]string{"icacls", dir, "/grant:r", TaskUser.Name + ":(OI)(CI)F"},
	)
}

// see http://ss64.com/nt/icacls.html
func makeDirUnreadable(dir string) error {
	return runCommands(
		false,
		[]string{"icacls", dir, "/remove:g", TaskUser.Name},
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
		commands[i] = []string{"net", "localgroup", group, "/add", TaskUser.Name}
	}
	if config.RunTasksAsCurrentUser {
		task.Logf("Not adding user %v to groups %v since we are running as current user. Skipping following commands:", TaskUser.Name, groups)
		for _, command := range commands {
			task.Logf("%#v", command)
		}
		return nil
	}
	return runCommands(false, commands...)
}
