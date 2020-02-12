package main

import (
	"log"
	"os"
	"os/exec"
	"strconv"
	"syscall"
)

// main spawns a process in a new process group that inherits the stdout/stderr
// console handles of the parent and runs for approx args[1] seconds
func main() {
	log.SetFlags(0)
	log.SetPrefix(os.Args[0] + ": ")
	if len(os.Args) < 2 {
		log.Print("Argument missing - SECONDS must be specified")
		log.Fatal("Usage: go run spawn-orphan-process.go [SECONDS]")
	}
	seconds, err := strconv.Atoi(os.Args[1])
	if err != nil {
		log.Printf("Invaild argument SECONDS - needs to be an integer, but is '%v'", os.Args[1])
		log.Fatal("Usage: go run spawn-orphan-process.go [SECONDS]")
	}
	// The duration in seconds is approximately equal to the number of pings
	// minus one (e.g. one ping will return almost immediately, two pings will
	// return in just over one second, etc).
	cmd := exec.Command("ping", "127.0.0.1", "-n", strconv.Itoa(seconds+1))
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP | syscall.CREATE_UNICODE_ENVIRONMENT,
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err = cmd.Start()
	if err != nil {
		log.Fatal("%v", err)
	}
}
