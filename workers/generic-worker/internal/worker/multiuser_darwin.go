//go:build multiuser

package worker

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"

	"golang.org/x/sys/unix"

	"github.com/taskcluster/taskcluster/v90/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v90/workers/generic-worker/runtime"
)

func defaultTasksDir() string {
	return "/Users"
}

func PreRebootSetup(nextTaskUser *gwruntime.OSUser) {

	homeDir := filepath.Join("/Users", nextTaskUser.Name)
	logPath := filepath.Join(homeDir, "gw-launch-agent.log")
	libraryDir := filepath.Join(homeDir, "Library")
	agentDir := filepath.Join(libraryDir, "LaunchAgents")
	plistPath := filepath.Join(agentDir, "com.mozilla.genericworker.launchagent.plist")

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
    <key>StandardOutPath</key>
    <string>` + logPath + `</string>
    <key>StandardErrorPath</key>
    <string>` + logPath + `</string>
</dict>
</plist>`

	if err := os.MkdirAll(agentDir, 0755); err != nil {
		panic(err)
	}

	if err := os.WriteFile(plistPath, []byte(plist), 0644); err != nil {
		panic(err)
	}

	for _, path := range []string{
		libraryDir,
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

	log.Print("Launch Agent listening on", socketPath)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Print("Error accepting connection:", err)
			continue
		}

		go handleConnection(conn)
	}
}

func handleConnection(conn net.Conn) {
	log.Print("Handling connection")
	defer conn.Close()

	var oobn int
	var err error
	var msgs []unix.SocketControlMessage
	var fds []int
	var n int
	var flags int

	// Receive FDs
	oob := make([]byte, 1024)
	buf := make([]byte, 16384)

	n, oobn, flags, _, err = conn.(*net.UnixConn).ReadMsgUnix(buf, oob)

	r := &process.Result{}

	// defer function to return response, so even if we exit early due to an error, a response is sent
	defer func() {
		if err != nil {
			if exiterr, ok := err.(*exec.ExitError); ok {
				r.ExitError = exiterr
				log.Printf("Command failed with exit code: %v", err)
			} else {
				r.SystemError = err
				log.Printf("Command encountered system error: %v", err)
			}
		}
		r.SetExitCode()
		msg, _ := json.Marshal(*r)
		_ = process.WriteFrame(conn, msg)
	}()

	if err != nil {
		return
	}

	msg := buf[:n]
	log.Printf("Received message: %v", string(msg))

	if flags&unix.MSG_TRUNC != 0 {
		err = errors.New("command too big to be processed by launch agent - 16KB buffer limit")
		return
	}
	if flags&unix.MSG_CTRUNC != 0 {
		err = errors.New("generic worker bug: file handles too big for buffer")
		return
	}

	msgs, err = unix.ParseSocketControlMessage(oob[:oobn])
	if err != nil {
		return
	}
	fds, err = unix.ParseUnixRights(&msgs[0])
	if err != nil {
		return
	}
	log.Printf("Received FDs: %#v", fds)

	var request process.CommandRequest
	err = json.Unmarshal(buf[:n], &request)
	if err != nil {
		return
	}

	log.Print("Post-unmarshal")

	cmd := exec.Command(request.Path, request.Args[1:]...)
	cmd.Dir = request.Dir
	cmd.Env = request.Env
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: request.Setpgid,
		Setctty: request.Setctty,
		Setsid:  request.Setsid,
	}

	fdIndex := 0
	if request.Stdin {
		stdin := os.NewFile(uintptr(fds[fdIndex]), "stdin")
		cmd.Stdin = stdin
		fdIndex++
	}
	if request.Stdout {
		stdout := os.NewFile(uintptr(fds[fdIndex]), "stdout")
		cmd.Stdout = stdout
		fdIndex++
	}
	if request.Stderr {
		stderr := os.NewFile(uintptr(fds[fdIndex]), "stderr")
		cmd.Stderr = stderr
		fdIndex++
	}
	log.Printf("Created %d file descriptors", fdIndex)

	started := time.Now()
	// defer function to return response, so even if we exit early due to an error, a response is sent
	defer func() {
		finished := time.Now()
		// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
		r.Duration = finished.Round(0).Sub(started)
	}()
	err = cmd.Start()
	if err != nil {
		log.Print("Error starting command")
		return
	}

	r.Pid = cmd.Process.Pid
	msg, _ = json.Marshal(*r)
	_ = process.WriteFrame(conn, msg)

	log.Printf("Started command: %s with PID %d\n", request.Path, cmd.Process.Pid)

	exitErr := make(chan error)
	// wait for command to complete in separate go routine, so that later we
	// can handle abortion in parallel to command termination (currently not
	// implemented)
	go func() {
		waitErr := cmd.Wait()
		exitErr <- waitErr
	}()

	err = <-exitErr
	r.UserTime = cmd.ProcessState.UserTime()
	r.KernelTime = cmd.ProcessState.SystemTime()
}
