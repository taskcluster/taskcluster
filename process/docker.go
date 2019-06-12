// +build docker

package process

import (
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"golang.org/x/net/context"
)

type PlatformData struct{}

func (pd *PlatformData) ReleaseResources() error {
	return nil
}

type Result struct {
	SystemError error
	exitCode    int64
	Duration    time.Duration
}

type Command struct {
	mutex            sync.RWMutex
	ctx              context.Context
	cli              *client.Client
	resp             container.ContainerCreateCreatedBody
	writer           io.Writer
	cmd              []string
	workingDirectory string
	env              []string
}

var cli *client.Client

func init() {
	var err error
	// cli, err = client.NewClientWithOpts(client.WithVersion("1.24"))
	cli, err = client.NewClient(client.DefaultDockerHost, "1.24", nil, nil)
	if err != nil {
		panic(err)
	}
}

func (c *Command) SetEnv(envVar, value string) {
	c.env = append(c.env, envVar+"="+value)
}

func (c *Command) DirectOutput(writer io.Writer) {
	c.writer = writer
}

func (c *Command) String() string {
	return fmt.Sprintf("%q", c.cmd)
}

func (c *Command) Execute() (r *Result) {

	var outPull io.ReadCloser
	r = &Result{}
	c.mutex.Lock()
	defer c.mutex.Unlock()
	outPull, r.SystemError = cli.ImagePull(c.ctx, "ubuntu", types.ImagePullOptions{})
	if r.SystemError != nil {
		return
	}
	defer outPull.Close()
	io.Copy(c.writer, outPull)

	c.resp, r.SystemError = c.cli.ContainerCreate(
		c.ctx,
		&container.Config{
			Image:      "ubuntu",
			Cmd:        c.cmd,
			WorkingDir: c.workingDirectory,
			Env:        c.env,
		},
		nil,
		nil,
		"",
	)
	if r.SystemError != nil {
		return
	}

	r.SystemError = c.cli.ContainerStart(c.ctx, c.resp.ID, types.ContainerStartOptions{})
	if r.SystemError != nil {
		return
	}

	started := time.Now()
	res, errch := c.cli.ContainerWait(c.ctx, c.resp.ID, container.WaitConditionNotRunning)
	select {
	case r.SystemError = <-errch:
		if r.SystemError != nil {
			return
		}
	case exitCode := <-res:
		r.exitCode = exitCode.StatusCode
	}

	var outLogs io.ReadCloser
	outLogs, r.SystemError = c.cli.ContainerLogs(c.ctx, c.resp.ID, types.ContainerLogsOptions{ShowStdout: true})
	if r.SystemError != nil {
		return
	}
	defer outLogs.Close()
	io.Copy(c.writer, outLogs)

	finished := time.Now()
	r.Duration = finished.Sub(started)
	return
}

func (r *Result) ExitCode() int64 {
	return r.exitCode
}

func (r *Result) CrashCause() error {
	return r.SystemError
}

func (r *Result) Crashed() bool {
	return r.SystemError != nil
}

func (r *Result) FailureCause() error {
	return fmt.Errorf("Exit code %v", r.exitCode)
}

func (r *Result) Failed() bool {
	return r.exitCode != 0
}

func NewCommand(commandLine []string, workingDirectory string, env []string) (*Command, error) {
	c := &Command{
		ctx:              context.Background(),
		writer:           os.Stdout,
		cmd:              commandLine,
		workingDirectory: workingDirectory,
		cli:              cli,
		env:              env,
	}
	return c, nil
}

func (c *Command) Kill() ([]byte, error) {
	return nil, nil
}
