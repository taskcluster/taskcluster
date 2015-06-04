package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
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
	processCommandOutput(removeOSUser, "wmic", "useraccount", "get", "name")
	homeDirsParent, err := os.Open("C:\\Users")
	if err != nil {
		return err
	}
	defer homeDirsParent.Close()
	fi, err := homeDirsParent.Readdir(-1)
	if err != nil {
		return err
	}
	for _, file := range fi {
		if file.IsDir() {
			if fileName := file.Name(); strings.HasPrefix(fileName, "Task_") {
				path := "C:\\Users\\" + fileName
				fmt.Println("Removing home directory '" + path + "'...")
				err = os.RemoveAll(path)
				if err != nil {
					fmt.Println("WARNING: could not delete directory '" + path + "'")
				}
			}
		}
	}
	return nil
}

func removeOSUser(line string) {
	if strings.HasPrefix(line, "Task_") {
		user := line
		fmt.Println("Attempting to remove OS user " + user + "...")
		out, err := exec.Command("net", "user", user, "/delete").Output()
		if err != nil {
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
