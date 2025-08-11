//go:build multiuser

package process

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"sync"
	"time"

	"golang.org/x/sys/unix"
)

type (
	Command struct {
		// ResourceMonitor is a function that monitors the system's resource usage.
		// It should send the resource usage data to the first channel of type
		// *ResourceUsage and stop measuring usage when the second channel of
		// type struct{} is closed.
		ResourceMonitor func(chan *ResourceUsage, chan struct{})
		mutex           sync.RWMutex
		*exec.Cmd
		// abort channel is closed when Kill() is called so that Execute() can
		// return even if cmd.Wait() is blocked. This is useful since cmd.Wait()
		// sometimes does not return promptly.
		abort chan struct{}
		// Once command has run, Result is updated (similar to cmd.ProcessState)
		result *Result
		conn   net.Conn
		// keeps files reachable
		auxFiles []*os.File
	}

	CommandRequest struct {
		Path    string   `json:"path"`
		Args    []string `json:"args"`
		Env     []string `json:"env"`
		Dir     string   `json:"dir"`
		Stdin   bool     `json:"stdin"`
		Stdout  bool     `json:"stdout"`
		Stderr  bool     `json:"stderr"`
		Setctty bool     `json:"setctty"`
		Setpgid bool     `json:"setpgid"`
		Setsid  bool     `json:"setsid"`
	}
)

func connectWithRetry(socketPath string, timeout time.Duration) (net.Conn, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("timeout reached waiting for launch agent socket: %w", ctx.Err())
		case <-ticker.C:
			if _, err := os.Stat(socketPath); errors.Is(err, os.ErrNotExist) {
				// Socket file not yet present — skip connection attempt
				continue
			}
			conn, err := net.Dial("unix", socketPath)
			if err == nil {
				return conn, nil // success!
			}
			log.Print(err)
		}
	}
}

func WriteFrame(w io.Writer, payload []byte) error {
	var lenBuf [4]byte
	binary.BigEndian.PutUint32(lenBuf[:], uint32(len(payload)))
	if _, err := w.Write(lenBuf[:]); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}

func ReadFrame(r io.Reader) ([]byte, error) {
	var lenBuf [4]byte
	if _, err := io.ReadFull(r, lenBuf[:]); err != nil {
		return nil, err
	}
	length := binary.BigEndian.Uint32(lenBuf[:])
	buf := make([]byte, length)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}
	return buf, nil
}

// shouldNotUseAgent returns true if c should not be started via the Generic
// Worker Launch Agent, but instead should be launched as a regular subprocess.
func (c *Command) shouldNotUseAgent() bool {
	return Headless || c.SysProcAttr == nil || c.SysProcAttr.Credential == nil || c.SysProcAttr.Credential.Uid == 0
}

func (c *Command) Start() error {

	// If command is meant to run as current user, or in headless mode (no
	// desktop => no launch agent) don't send it to the launch agent...
	if c.shouldNotUseAgent() {
		return c.Cmd.Start()
	}

	request := CommandRequest{
		Path:    c.Path,
		Args:    c.Args,
		Env:     c.Env,
		Dir:     c.Dir,
		Setctty: c.SysProcAttr.Setctty,
		Setpgid: c.SysProcAttr.Setpgid,
		Setsid:  c.SysProcAttr.Setsid,
	}

	socketPath := "/tmp/launch-agent.sock"

	// Connect to the Launch Agent's Unix Domain Socket
	conn, err := connectWithRetry(socketPath, time.Minute)
	if err != nil {
		return fmt.Errorf("error connecting to launch agent: %w", err)
	}
	c.conn = conn

	fds := []int{}
	gofuncs := []func(){}

	// declare outside of if statements so that file descriptors don't get garbage collected
	var stdinReader, stdinWriter, stdoutReader, stdoutWriter, stderrReader, stderrWriter *os.File
	var errPipe error

	if c.Stdin != nil {
		request.Stdin = true
		stdinReader, stdinWriter, errPipe = os.Pipe()
		if errPipe != nil {
			return fmt.Errorf("failed to create stdin pipe: %w", errPipe)
		}
		gofuncs = append(gofuncs, func() {
			_, _ = io.Copy(stdinWriter, c.Stdin)
			stdinWriter.Close()
			// not sure if this is needed, but let's make sure both ends of the
			// pipe are not garbage collected until we've finished using them!
			c.auxFiles = append(c.auxFiles, stdinReader)
		})
		fds = append(fds, int(stdinReader.Fd()))
	}

	if c.Stdout != nil {
		request.Stdout = true
		stdoutReader, stdoutWriter, errPipe = os.Pipe()
		if errPipe != nil {
			return fmt.Errorf("failed to create stdout pipe: %w", errPipe)
		}
		gofuncs = append(gofuncs, func() {
			_, _ = io.Copy(c.Stdout, stdoutReader)
			stdoutReader.Close()
			// not sure if this is needed, but let's make sure both ends of the
			// pipe are not garbage collected until we've finished using them!
			c.auxFiles = append(c.auxFiles, stdoutWriter)
		})
		fds = append(fds, int(stdoutWriter.Fd()))
	}

	if c.Stderr != nil {
		request.Stderr = true
		stderrReader, stderrWriter, errPipe = os.Pipe()
		if errPipe != nil {
			return fmt.Errorf("failed to create stderr pipe: %w", errPipe)
		}
		gofuncs = append(gofuncs, func() {
			_, _ = io.Copy(c.Stderr, stderrReader)
			stderrReader.Close()
			// not sure if this is needed, but let's make sure both ends of the
			// pipe are not garbage collected until we've finished using them!
			c.auxFiles = append(c.auxFiles, stderrWriter)
		})
		fds = append(fds, int(stderrWriter.Fd()))
	}

	log.Printf("FDs: %#v", fds)

	// Send FDs to the agent using SCM_RIGHTS
	rights := unix.UnixRights(fds...)

	payload, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}

	log.Printf("Request to be sent from daemon: %v", string(payload))

	_, _, err = conn.(*net.UnixConn).WriteMsgUnix(payload, rights, nil)
	if err != nil {
		return fmt.Errorf("failed to write to unix socket: %w", err)
	}

	// Only start io/copy go routines after writing FDs to the socket, to avoid
	// prematurely consuming/publishing data
	for _, f := range gofuncs {
		go f()
	}

	log.Print("Request sent, reading response")

	// Read response

	frame, err := ReadFrame(c.conn)
	if err != nil {
		return fmt.Errorf("read failed: %w", err)
	}
	var resp Result
	if err := json.Unmarshal(frame, &resp); err != nil {
		return fmt.Errorf("bad JSON: %w", err)
	}
	log.Printf("Response: %#v", resp)
	// update value, not pointer, since other code may be holding onto pointer value
	*c.result = resp
	return c.result.SystemError
}

func (c *Command) Wait() error {
	// If not using Generic Worker launch agent, use the standard library Wait method instead
	if c.shouldNotUseAgent() {
		return c.Cmd.Wait()
	}
	defer func() {
		c.auxFiles = nil
	}()
	defer c.conn.Close()
	if c.result.SystemError != nil {
		return c.result.SystemError
	}
	if c.result.Pid == 0 {
		return errors.New("wait called but PID not set")
	}
	resultReceived := false
	for {
		frame, err := ReadFrame(c.conn)
		if err == io.EOF {
			break
		} else if err != nil {
			return fmt.Errorf("read failed: %w", err)
		}
		var resp Result
		if err := json.Unmarshal(frame, &resp); err != nil {
			return fmt.Errorf("bad JSON: %w", err)
		}
		log.Printf("Daemon: result received: %#v", resp)
		// update value, not pointer, since other code may be holding onto pointer value
		*c.result = resp
		resultReceived = true
	}
	if !resultReceived {
		return errors.New("no result received")
	}
	return nil
}
