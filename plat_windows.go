package main

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/dchest/uniuri"
	"github.com/taskcluster/generic-worker/os/exec"
	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

func processCommandOutput(callback func(line string), prog string, options ...string) error {
	out, err := exec.Command(prog, options...).Output()
	if err != nil {
		debug("%v", err)
		return err
	}
	for _, line := range strings.Split(string(out), "\r\n") {
		trimmedLine := strings.Trim(line, "\r\n ")
		callback(trimmedLine)
	}
	return nil
}

func startup() error {
	debug("Detected Windows platform...")
	// debug("Creating powershell script...")
	// err := createRunAsUserScript("C:\\generic-worker\\runasuser.ps1") // hardcoded, but will go with bug 1176072
	// if err != nil {
	// 	return err
	// }
	return taskCleanup()
}

func deleteHomeDir(path string, user string) error {
	debug("Removing home directory '" + path + "'...")

	adminDeleteHomeDir := func(path string) error {
		err := os.RemoveAll(path)
		if err != nil {
			debug("WARNING: could not delete directory '" + path + "'")
			debug("%v", err)
			return err
		}
		return nil
	}

	// first try using task user
	// passwordFile := filepath.Dir(path) + "\\" + user + "\\_Passw0rd"
	// password, err := ioutil.ReadFile(passwordFile)
	// if err != nil || string(password) == "" {
	// 	debug("%#v", err)
	// 	debug("Failed to read password file %v, (to delete dir %v) trying to remove with generic worker account...", passwordFile, path)
	// 	return adminDeleteHomeDir(path)
	// }
	err := runCommands(false, []string{
		"del /s /q /f",
		path,
	})
	if err != nil {
		debug("%#v", err)
		debug("Failed to remove %v with user %v, trying to remove with generic worker account instead...")
		return adminDeleteHomeDir(path)
	}
	return nil
}

func createNewTaskUser() error {
	// username can only be 20 chars, uuids are too long, therefore
	// use prefix (5 chars) plus seconds since epoch (10 chars)
	userName := "Task_" + strconv.Itoa((int)(time.Now().Unix()))
	password := generatePassword()
	TaskUser = OSUser{
		HomeDir:  "C:\\Users\\" + userName,
		Name:     userName,
		Password: password,
	}
	err := (&TaskUser).createNewOSUser()
	if err != nil {
		return err
	}
	// store password
	err = ioutil.WriteFile(TaskUser.HomeDir+"\\_Passw0rd", []byte(TaskUser.Password), 0666)
	if err != nil {
		return err
	}
	return os.MkdirAll(filepath.Join(TaskUser.HomeDir, "public", "logs"), 0777)
}

func (user *OSUser) createNewOSUser() error {
	return user.createOSUserAccountForce(false)
}

func (user *OSUser) createOSUserAccountForce(okIfExists bool) error {
	debug("Forcefully creating directory " + filepath.Dir(user.HomeDir) + "...")
	// MkdirAll doesn't fail if dir already exists, therefore
	// call MkdirAll on parent dir, and then Mkdir
	err := os.MkdirAll(filepath.Dir(user.HomeDir), 0755)
	// this error is unrecoverable, regardless of `okIfExists` so return...
	if err != nil {
		return err
	}
	// note: Mkdir, not MkdirAll, so we get a failure if it exists...
	// note: we can't get a failure for parent directory not existing
	// as we just created it successfully
	err = os.Mkdir(user.HomeDir, 0755)
	homeDirExisted := false
	if err != nil {
		switch err.(type) {
		case *os.PathError:
			// regardless of `okIfExists` we probably never want to return an error
			// for creating a directory that exists, but it is important to
			// know that it existed for next steps...
			homeDirExisted = true
		default:
			return err
		}
	}
	// if home dir existed, these are allowed to fail
	// if it didn't, they aren't!
	err = runCommands(homeDirExisted,
		[]string{"icacls", user.HomeDir, "/remove:g", "Users"},
		[]string{"icacls", user.HomeDir, "/remove:g", "Everyone"},
		[]string{"icacls", user.HomeDir, "/inheritance:r"},
	)
	if !homeDirExisted && err != nil {
		return err
	}
	debug("Creating Windows User " + user.Name + "...")
	userExisted, err := allowError(
		"The account already exists",
		"net", "user", user.Name, user.Password, "/add", "/expires:never", "/passwordchg:no", "/homedir:"+user.HomeDir, "/y",
	)
	if err != nil {
		return err
	}
	if !okIfExists && userExisted {
		return fmt.Errorf("User " + user.Name + " already existed - cannot create")
	}
	// if user existed, these commands can fail
	// if it didn't, they can't
	err = runCommands(userExisted,
		[]string{"icacls", user.HomeDir, "/grant:r", user.Name + ":(CI)F", "SYSTEM:(CI)F", "Administrators:(CI)F"},
		[]string{"net", "localgroup", "Remote Desktop Users", "/add", user.Name},
	)
	if !userExisted {
		return err
	}
	return nil
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
	deleteHomeDirs()
	debug("Looking for existing task users to delete...")
	err := processCommandOutput(deleteOSUserAccount, "wmic", "useraccount", "get", "name")
	if err != nil {
		debug("WARNING: could not list existing Windows user accounts")
		debug("%v", err)
	}
}

func deleteHomeDirs() {
	homeDirsParent, err := os.Open("C:\\Users")
	if err != nil {
		debug("WARNING: Could not open C:\\Users directory to find old home directories to delete")
		debug("%v", err)
		return
	}
	defer homeDirsParent.Close()
	fi, err := homeDirsParent.Readdir(-1)
	if err != nil {
		debug("WARNING: Could not read complete directory listing to find old home directories to delete")
		debug("%v", err)
		// don't return, since we may have partial listings
	}
	for _, file := range fi {
		if file.IsDir() {
			if fileName := file.Name(); strings.HasPrefix(fileName, "Task_") {
				path := "C:\\Users\\" + fileName
				// fileName could be <user> or <user>.<hostname>...
				user := fileName
				if i := strings.IndexRune(user, '.'); i >= 0 {
					user = user[:i]
				}
				// ignore any error occuring here, not a lot we can do about it...
				deleteHomeDir(path, user)
			}
		}
	}

}

func deleteOSUserAccount(line string) {
	if strings.HasPrefix(line, "Task_") {
		user := line
		debug("Attempting to remove Windows user " + user + "...")
		err := runCommands(false, []string{"net", "user", user, "/delete"})
		if err != nil {
			debug("WARNING: Could not remove Windows user account " + user)
			debug("%v", err)
		}
	}
}

func (task *TaskRun) generateCommand(index int, writer io.Writer) error {
	// In order that capturing of log files works, create a custom .bat file
	// for the task which redirects output to a log file...
	env := filepath.Join(TaskUser.HomeDir, "env.txt")
	dir := filepath.Join(TaskUser.HomeDir, "dir.txt")
	commandName := fmt.Sprintf("command_%06d", index)
	wrapper := filepath.Join(TaskUser.HomeDir, commandName+"_wrapper.bat")
	script := filepath.Join(TaskUser.HomeDir, commandName+".bat")
	logFile := "public/logs/" + commandName + ".log"
	absLogFile := filepath.Join(TaskUser.HomeDir, "public", "logs", commandName+".log")
	contents := ":: This script runs command " + strconv.Itoa(index) + " defined in TaskId " + task.TaskId + "..." + "\r\n"
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
		for envVar, envValue := range task.Payload.Env {
			debug("Setting env var: %v=%v", envVar, envValue)
			contents += "set " + envVar + "=" + envValue + "\r\n"
		}
		contents += "cd \"" + TaskUser.HomeDir + "\"" + "\r\n"

		// Otherwise get the env from the previous command
	} else {
		for _, x := range [2][2]string{{env, "set "}, {dir, "cd "}} {
			file, err := os.Open(x[0])
			if err != nil {
				return err
			}
			defer file.Close()

			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				contents += x[1] + scanner.Text() + "\r\n"
			}

			if err := scanner.Err(); err != nil {
				return err
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

	debug("Generating script:")
	debug(contents)

	// now generate the .bat script that runs all of this
	err := ioutil.WriteFile(
		wrapper,
		[]byte(contents),
		0755,
	)

	if err != nil {
		return err
	}

	// Now make the actual task a .bat script
	fileContents := []byte(task.Payload.Command[index] + "\r\n")

	err = ioutil.WriteFile(
		script,
		fileContents,
		0755,
	)

	debug("Script %q:", script)
	debug("Contents:")
	debug(string(fileContents))

	if err != nil {
		return err
	}

	// can't use runCommands(...) here because we don't want to execute, only create
	command := []string{
		wrapper,
	}

	// command := []string{
	// 	"PowerShell",
	// 	"-File",
	// 	"C:\\generic-worker\\runasuser.ps1", // hardcoded, but will go with bug 1176072
	// 	User.Name,
	// 	User.Password,
	// 	wrapper,
	// 	User.HomeDir,
	// }

	cmd := exec.Command(command[0], command[1:]...)
	cmd.Username = TaskUser.Name
	cmd.Password = TaskUser.Password
	cmd.Dir = TaskUser.HomeDir
	debug("Running command: '" + strings.Join(command, "' '") + "'")
	log, err := os.Create(absLogFile)
	if err != nil {
		return err
	}
	multiWriter := io.MultiWriter(writer, log)
	cmd.Stdout = multiWriter
	cmd.Stderr = multiWriter
	// cmd.Stdin = strings.NewReader("blah blah")
	task.Commands[index] = Command{logFile: logFile, osCommand: cmd}
	return nil
}

func taskCleanup() error {
	// note if this fails, we carry on without throwing an error
	deleteExistingOSUsers()
	// this needs to succeed, so return an error if it doesn't
	return createNewTaskUser()
}

func install(arguments map[string]interface{}) (err error) {
	exePath, err := ExePath()
	if err != nil {
		return err
	}
	configFile := convertNilToEmptyString(arguments["--config"])
	nssm := convertNilToEmptyString(arguments["--nssm"])
	serviceName := convertNilToEmptyString(arguments["--service-name"])
	username := convertNilToEmptyString(arguments["--username"])
	password := convertNilToEmptyString(arguments["--password"])
	if password == "" {
		password = generatePassword()
	}
	user := OSUser{
		Name:     username,
		Password: password,
		HomeDir:  filepath.Dir(exePath),
	}
	fmt.Println("User: " + user.Name + ", Password: " + user.Password + ", HomeDir: " + user.HomeDir)

	config.Debug = "*"                      // TODO: temporary hack, can maybe drop
	config.RefreshUrlsPrematurelySecs = 310 // TODO: temporary hack, can maybe drop
	persistConfig(configFile)               // TODO: probably should load the config before persisting it
	if err != nil {
		return err
	}
	user.HomeDir = "C:\\genworkerhome" // TODO: temporary hack!!
	err = user.ensureUserAccount()
	user.HomeDir = "C:\\generic-worker" // TODO: temporary hack!!
	if err != nil {
		return err
	}
	err = user.makeAdmin()
	if err != nil {
		return err
	}
	return deployService(&user, configFile, nssm, serviceName, exePath)
}

// Runs command `command` with arguments `args`. If standard error from command
// includes `errString` then true, is returned with no error. Otherwise false
// is returned, with or without an error.
func allowError(errString string, command string, args ...string) (bool, error) {
	debug("Running command: '" + strings.Join(append([]string{command}, args...), "' '") + "'")
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

// deploys the generic worker as a windows service, running under the windows
// user specified with username/password, such that the generic worker runs
// with the given configuration file configFile. the http://nssm.cc/ executable
// is required to install the service, specified as a file system path. The
// serviceName is the service name given to the newly created service. if the
// service already exists, it is simply updated.
func deployService(user *OSUser, configFile string, nssm string, serviceName string, exePath string) error {
	return runCommands(false,
		[]string{nssm, "install", serviceName, exePath},
		[]string{nssm, "set", serviceName, "AppDirectory", user.HomeDir},
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
		[]string{nssm, "set", serviceName, "AppStdout", filepath.Join(user.HomeDir, "generic-worker.log")},
		[]string{nssm, "set", serviceName, "AppStderr", filepath.Join(user.HomeDir, "generic-worker.log")},
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
		debug("Running command: '" + strings.Join(command, "' '") + "'")
		cmd := exec.Command(command[0], command[1:]...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		err = cmd.Run()

		if err != nil {
			debug("%v", err)
			if !allowFail {
				return err
			}
		}
	}
	return err
}

func ExePath() (string, error) {
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
		fi, err := os.Stat(p)
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

// The following code is AUTO-GENERATED. Please DO NOT edit.
type (
	// This schema defines the structure of the `payload` property referred to
	// in a Task Cluster Task definition.
	GenericWorkerPayload struct {
		// Artifacts to be published. For example: `{ "type": "file", "path":
		// "builds\\firefox.exe", "expires": "2015-08-19T17:30:00.000Z" }`
		Artifacts []struct {
			// Date when artifact should expire must be in the future
			Expires tcclient.Time `json:"expires"`
			// Filesystem path of artifact
			Path string `json:"path"`
			// Artifacts can be either an individual `file` or a `directory`
			// containing potentially multiple files with recursively included
			// subdirectories
			Type string `json:"type"`
		} `json:"artifacts"`
		// One entry per command (consider each entry to be interpreted as a
		// full line of a Windows™ .bat file). For example: `["set", "echo
		// hello world > hello_world.txt", "set GOPATH=C:\\Go"]`.
		Command []string `json:"command"`
		// Example: ```{ "PATH": "C:\\Windows\\system32;C:\\Windows", "GOOS":
		// "darwin" }```
		Env map[string]string `json:"env"`
		// Maximum time the task container can run in seconds
		MaxRunTime int `json:"maxRunTime"`
	}
)
