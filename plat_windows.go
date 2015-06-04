package main

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type WindowsUser struct {
	HomeDir  string
	Name     string
	Password string
}

var (
	User WindowsUser
)

func processCommandOutput(callback func(line string), prog string, options ...string) error {
	out, err := exec.Command(prog, options...).Output()
	if err != nil {
		fmt.Printf("%v\n", err)
		return err
	}
	for _, line := range strings.Split(string(out), "\r\n") {
		trimmedLine := strings.Trim(line, "\r\n ")
		callback(trimmedLine)
	}
	return nil
}

func startup() error {
	// var lastError error = nil
	fmt.Println("Detected Windows platform...")
	fmt.Println("Looking for existing task users...")
	// note if this fails, we carry on
	deleteExistingWindowsUsers()
	return createNewWindowsUser()
}

func createNewWindowsUser() error {
	// username can only be 20 chars, uuids are too long, therefore
	// use prefix (5 chars) plus seconds since epoch (10 chars)
	userName := "Task_" + strconv.Itoa((int)(time.Now().Unix()))
	password := generatePassword()
	User := WindowsUser{
		HomeDir:  "C:\\Users\\" + userName,
		Name:     userName,
		Password: password,
	}
	err := os.MkdirAll(User.HomeDir, 0755)
	if err != nil {
		return err
	}
	commandsToRun := [][]string{
		{"icacls", User.HomeDir, "/remove:g", "Users"},
		{"icacls", User.HomeDir, "/remove:g", "Everyone"},
		{"icacls", User.HomeDir, "/inheritance:r"},
		{"icacls", User.HomeDir, "/grant:r", User.Name, ":(CI)F", "SYSTEM:(CI)F", "Administrators:(CI)F"},
		{"net", "user", User.Name, User.Password, "/add", "/expires:never", "/passwordchg:no", "/homedir:" + User.HomeDir},
		{"net", "localgroup", "Remote Desktop Users", "/add", User.Name},
	}
	for _, command := range commandsToRun {
		fmt.Println("Running command: '" + strings.Join(command, "' '") + "'")
		out, err := exec.Command(command[0], command[1:]...).Output()
		if err != nil {
			fmt.Printf("%v\n", err)
			return err
		}
		fmt.Println(string(out))
	}
	return nil
}

func generatePassword() string {
	return "mon123!@#"
}

func deleteExistingWindowsUsers() {
	err := processCommandOutput(deleteWindowsUserAccount, "wmic", "useraccount", "get", "name")
	if err != nil {
		fmt.Println("WARNING: could not list existing Windows user accounts")
		fmt.Println("%v\n", err)
	}
	deleteHomeDirs()
}

func deleteHomeDirs() {
	homeDirsParent, err := os.Open("C:\\Users")
	if err != nil {
		fmt.Println("WARNING: Could not open C:\\Users directory to find old home directories to delete")
		fmt.Println("%v\n", err)
		return
	}
	defer homeDirsParent.Close()
	fi, err := homeDirsParent.Readdir(-1)
	if err != nil {
		fmt.Println("WARNING: Could not read complete directory listing to find old home directories to delete")
		fmt.Println("%v\n", err)
		// don't return, since we may have partial listings
	}
	for _, file := range fi {
		if file.IsDir() {
			if fileName := file.Name(); strings.HasPrefix(fileName, "Task_") {
				path := "C:\\Users\\" + fileName
				fmt.Println("Removing home directory '" + path + "'...")
				err = os.RemoveAll(path)
				if err != nil {
					fmt.Println("WARNING: could not delete directory '" + path + "'")
					fmt.Println("%v\n", err)
				}
			}
		}
	}
}

func deleteWindowsUserAccount(line string) {
	if strings.HasPrefix(line, "Task_") {
		user := line
		fmt.Println("Attempting to remove Windows user " + user + "...")
		out, err := exec.Command("net", "user", user, "/delete").Output()
		if err != nil {
			fmt.Println("WARNING: Could not remove Windows user account " + user)
			fmt.Printf("%v\n", err)
		}
		fmt.Println(string(out))
	}
}

func (task *TaskRun) generateCommand() *exec.Cmd {
	// TODO: below is the *nix implementation, Windows needs to generate a .bat file
	// and run it using PsExec instead...
	cmd := exec.Command(task.Payload.Command[0], task.Payload.Command[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	task.prepEnvVars(cmd)
	return cmd
}
