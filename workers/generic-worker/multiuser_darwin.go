//go:build multiuser

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"

	gwruntime "github.com/taskcluster/taskcluster/v83/workers/generic-worker/runtime"
)

type CommandRequest struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
}

func defaultTasksDir() string {
	return "/Users"
}

func PreRebootSetup(nextTaskUser *gwruntime.OSUser) {
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mozilla.genericworker.launchagent</string>
    <key>ProgramArguments</key>
    <array>
        <string>` + gwruntime.GenericWorkerBinary() + `</string>
        <string>launch-agent</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>`

	LibraryDir := filepath.Join(config.TasksDir, nextTaskUser.Name, "Library")
	agentDir := filepath.Join(LibraryDir, "LaunchAgents")
	plistPath := filepath.Join(agentDir, "com.mozilla.genericworker.launchagent.plist")

	if err := os.MkdirAll(agentDir, 0755); err != nil {
		panic(err)
	}

	if err := os.WriteFile(plistPath, []byte(plist), 0644); err != nil {
		panic(err)
	}

	for _, path := range []string{
		LibraryDir,
		agentDir,
		plistPath,
	} {
		if err := makeFileOrDirReadWritableForUser(false, path, nextTaskUser); err != nil {
			panic(err)
		}
	}
}

func platformTargets(arguments map[string]any) ExitCode {
	switch {
	case arguments["launch-agent"]:
		err := launchAgent()
		exitOnError(CANT_LAUNCH_AGENT, err, "Cannot launch agent")
	default:
		log.Print("Internal error - no target found to run, yet command line parsing successful")
		return INTERNAL_ERROR
	}
	return 0
}

func launchAgent() error {

	socketPath := "/tmp/launch-agent.sock"
	// Clean up any existing socket file
	os.Remove(socketPath)

	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		return fmt.Errorf("Error creating socket: %w", err)
	}
	defer listener.Close()

	// Restrict access to the socket
	if err := os.Chmod(socketPath, 0600); err != nil {
		return fmt.Errorf("Error setting permissions on socket: %w", err)
	}

	fmt.Println("Launch Agent listening on", socketPath)

	for {
		conn, err := listener.Accept()
		if err != nil {
			fmt.Println("Error accepting connection:", err)
			continue
		}

		go handleConnection(conn)
	}
}

func handleConnection(conn net.Conn) {
	defer conn.Close()

	var request CommandRequest
	decoder := json.NewDecoder(conn)
	if err := decoder.Decode(&request); err != nil {
		fmt.Println("Error decoding request:", err)
		return
	}

	cmd := exec.Command(request.Command, request.Args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		fmt.Println("Error starting command:", err)
		return
	}

	fmt.Printf("Started command: %s with PID %d\n", request.Command, cmd.Process.Pid)
}
