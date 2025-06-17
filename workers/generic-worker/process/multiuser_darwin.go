//go:build multiuser

package process

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
)

type CommandRequest struct {
	Path string   `json:"path"`
	Args []string `json:"args"`
	Env  []string `json:"env"`
	Dir  string   `json:"dir"`
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

	socketPath := "/tmp/launch-agent.sock"

	// Connect to the Launch Agent's Unix Domain Socket
	conn, err := net.Dial("unix", socketPath)
	if err != nil {
		return fmt.Errorf("Error connecting to launch agent: %w", err)
	}
	defer conn.Close()

	// Send the request
	encoder := json.NewEncoder(conn)
	decoder := json.NewDecoder(conn)
	if err := encoder.Encode(request); err != nil {
		return fmt.Errorf("Error sending request: %w", err)
	}

	// Read response
	var response CommandResponse
	if err := decoder.Decode(&response); err != nil {
		return fmt.Errorf("Error reading response: %w", err)
	}

	if response.Error != "" {
		return errors.New(response.Error)
	}
	c.remotePID = response.PID
	return nil
}
