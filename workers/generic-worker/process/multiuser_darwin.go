//go:build multiuser

package process

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os/exec"
	"sync"
)

type Command struct {
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
	// only used by darwin_multiuser, to store value of PID created by
	// launch agent
	remotePID int
}

type CommandRequest struct {
	Path        string   `json:"path"`
	Args        []string `json:"args"`
	Env         []string `json:"env"`
	Dir         string   `json:"dir"`
	Stderr      bool     `json:"stderr"`
	Stdout      bool     `json:"stdout"`
	SysProcAttr bool     `json:"sysProcAttr"`
	Setctty     bool     `json:"setctty"`
	Setpgid     bool     `json:"setpgid"`
	Setsid      bool     `json:"setsid"`
}

type CommandResponse struct {
	PID   int    `json:"pid,omitempty"`
	Error string `json:"error,omitempty"`
}

func (c *Command) Start() error {

	request := CommandRequest{
		Path: c.Cmd.Path,
		Args: c.Cmd.Args,
		Env:  c.Cmd.Env,
		Dir:  c.Cmd.Dir,
	}

	if c.Cmd.SysProcAttr != nil {
		request.SysProcAttr = true
		request.Setctty = c.Cmd.SysProcAttr.Setctty
		request.Setpgid = c.Cmd.SysProcAttr.Setpgid
		request.Setsid = c.Cmd.SysProcAttr.Setsid
	}

	socketPath := "/tmp/launch-agent.sock"

	// Connect to the Launch Agent's Unix Domain Socket
	conn, err := net.Dial("unix", socketPath)
	if err != nil {
		return fmt.Errorf("error connecting to launch agent: %w", err)
	}
	defer conn.Close()

	// Send the request
	encoder := json.NewEncoder(conn)
	decoder := json.NewDecoder(conn)
	if err := encoder.Encode(request); err != nil {
		return fmt.Errorf("error sending request: %w", err)
	}

	// Read response
	var response CommandResponse
	if err := decoder.Decode(&response); err != nil {
		return fmt.Errorf("error reading response: %w", err)
	}

	if response.Error != "" {
		return errors.New(response.Error)
	}
	c.remotePID = response.PID
	return nil
}
