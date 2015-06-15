package main

import (
	"bufio"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/dchest/uniuri"
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
	passwordFile := filepath.Dir(path) + "\\" + user + "\\_Passw0rd"
	password, err := ioutil.ReadFile(passwordFile)
	if err != nil || string(password) == "" {
		debug("%#v", err)
		debug("Failed to read password file %v, (to delete dir %v) trying to remove with generic worker account...", passwordFile, path)
		return adminDeleteHomeDir(path)
	}
	command := []string{
		"C:\\Users\\Administrator\\PSTools\\PsExec.exe",
		"-u", user,
		"-p", string(password),
		"-w", "C:\\",
		"-n", "10",
		"rmdir",
		"/s",
		"/q",
		path,
	}
	cmd := exec.Command(command[0], command[1:]...)
	debug("Running command: '" + strings.Join(command, "' '") + "'")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err = cmd.Run()
	if err != nil {
		debug("%#v", err)
		debug("Failed to remove %v with user %v, trying to remove with generic worker account instead...")
		return adminDeleteHomeDir(path)
	}
	return nil
}

func createNewOSUser() error {
	// username can only be 20 chars, uuids are too long, therefore
	// use prefix (5 chars) plus seconds since epoch (10 chars)
	userName := "Task_" + strconv.Itoa((int)(time.Now().Unix()))
	password := generatePassword()
	User = OSUser{
		HomeDir:  "C:\\Users\\" + userName,
		Name:     userName,
		Password: password,
	}
	debug("Creating Windows User " + User.Name + "...")
	err := os.MkdirAll(User.HomeDir, 0755)
	if err != nil {
		return err
	}
	commandsToRun := [][]string{
		{"icacls", User.HomeDir, "/remove:g", "Users"},
		{"icacls", User.HomeDir, "/remove:g", "Everyone"},
		{"icacls", User.HomeDir, "/inheritance:r"},
		{"net", "user", User.Name, User.Password, "/add", "/expires:never", "/passwordchg:no", "/homedir:" + User.HomeDir, "/y"},
		{"icacls", User.HomeDir, "/grant:r", User.Name + ":(CI)F", "SYSTEM:(CI)F", "Administrators:(CI)F"},
		{"net", "localgroup", "Remote Desktop Users", "/add", User.Name},
	}
	for _, command := range commandsToRun {
		debug("Running command: '" + strings.Join(command, "' '") + "'")
		out, err := exec.Command(command[0], command[1:]...).Output()
		if err != nil {
			debug("%v", err)
			return err
		}
		debug(string(out))
	}
	// store password
	err = ioutil.WriteFile(User.HomeDir+"\\_Passw0rd", []byte(password), 0666)
	if err != nil {
		return err
	}
	return os.MkdirAll(filepath.Join(User.HomeDir, "public", "logs"), 0666)
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
		out, err := exec.Command("net", "user", user, "/delete").Output()
		if err != nil {
			debug("WARNING: Could not remove Windows user account " + user)
			debug("%v", err)
		}
		debug(string(out))
	}
}

func (task *TaskRun) generateCommand(index int) (Command, error) {
	// In order that capturing of log files works, create a custom .bat file
	// for the task which redirects output to a log file...
	env := filepath.Join(User.HomeDir, "env.txt")
	dir := filepath.Join(User.HomeDir, "dir.txt")
	commandName := fmt.Sprintf("command_%06d", index)
	wrapper := filepath.Join(User.HomeDir, commandName+"_wrapper.bat")
	script := filepath.Join(User.HomeDir, commandName+".bat")
	log := filepath.Join(User.HomeDir, "public", "logs", commandName+".log")
	contents := ":: This script runs command " + strconv.Itoa(index) + " defined in TaskId " + task.TaskId + "..." + "\r\n"

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
		contents += "cd \"" + User.HomeDir + "\"" + "\r\n"

		// Otherwise get the env from the previous command
	} else {
		for _, x := range [2][2]string{{env, "set "}, {dir, "cd "}} {
			file, err := os.Open(x[0])
			if err != nil {
				return Command{}, err
			}
			defer file.Close()

			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				contents += x[1] + scanner.Text() + "\r\n"
			}

			if err := scanner.Err(); err != nil {
				return Command{}, err
			}
		}
	}

	// see http://blogs.msdn.com/b/oldnewthing/archive/2008/09/26/8965755.aspx
	// need to explicitly unset as we rely on it later
	contents += "set errorlevel=\r\n"

	// now call the actual script that runs the command
	contents += "call " + script + " > " + log + " 2>&1" + "\r\n"

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
		return Command{}, err
	}

	// Now make the actual task a .bat script
	fileContents := []byte(task.Payload.Command[index] + "\r\n")

	err = ioutil.WriteFile(
		script,
		fileContents,
		0755,
	)

	if err != nil {
		return Command{}, err
	}

	command := []string{
		"C:\\Users\\Administrator\\PSTools\\PsExec.exe",
		"-u", User.Name,
		"-p", User.Password,
		"-w", User.HomeDir,
		"-n", "10",
		wrapper,
	}
	cmd := exec.Command(command[0], command[1:]...)
	debug("Running command: '" + strings.Join(command, "' '") + "'")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	task.Commands[index] = Command{logFile: "public/logs/" + commandName + ".log", osCommand: cmd}
	return task.Commands[index], nil
}

func taskCleanup() error {
	// note if this fails, we carry on without throwing an error
	deleteExistingOSUsers()
	// this needs to succeed, so return an error if it doesn't
	return createNewOSUser()
}
