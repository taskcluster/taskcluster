// Package shell implements the shell command.
package shell

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"

	isatty "github.com/mattn/go-isatty"
	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster-cli/cmds/root"
	"github.com/taskcluster/taskcluster-cli/config"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"github.com/taskcluster/taskcluster-worker/engines"
	v2client "github.com/taskcluster/taskcluster-worker/plugins/interactive/shellclient"
	"github.com/taskcluster/taskcluster-worker/runtime/ioext"
)

var (
	// Command is the root of the shell sub-tree.
	Command = &cobra.Command{
		Use:   "shell <taskId>",
		Short: "Connect to the shell of a running interactive task.",
		RunE:  Execute,
	}
)

func init() {
	root.Command.AddCommand(Command)
}

// Execute runs the shell.
func Execute(cmd *cobra.Command, args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("%s expects argument <taskId>", cmd.Name())
	}

	taskID := args[0]

	var creds *tcclient.Credentials
	if config.Credentials != nil {
		creds = config.Credentials.ToClientCredentials()
	}

	q := queue.New(creds)

	err := checkTask(q, taskID)
	if err != nil {
		return err
	}

	// At this point we know we have a valid task with interactivity.
	sURL, err := q.GetLatestArtifact_SignedURL(taskID, "private/docker-worker/shell.html", 1*time.Minute)
	if err != nil {
		return err
	}

	// client is an HTTP client that doesn't follow redirects.
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Get(sURL.String())
	if err != nil {
		return err
	}
	redirectURL, err := resp.Location()
	if err != nil {
		return err
	}

	var sockURL *url.URL
	var shell engines.Shell
	tty := isatty.IsTerminal(os.Stdout.Fd())

	switch redirectURL.Query().Get("v") {
	case "1":
		return errors.New("the shell client doens't yet support v1 shells")
	case "2":
		sockURL, _ = url.Parse(redirectURL.Query().Get("socketUrl"))
		shell, err = v2client.Dial(sockURL.String(), []string{"bash"}, tty)
		if err != nil {
			return fmt.Errorf("could not create the shell client: %v", err)
		}
	default:
		return errors.New("unknown shell version")
	}

	// Switch terminal to raw mode
	cleanup := func() {}
	if tty {
		cleanup = setupRawTerminal(shell.SetSize)
	}

	// Connect pipes
	go ioext.CopyAndClose(shell.StdinPipe(), os.Stdin)
	go io.Copy(os.Stdout, shell.StdoutPipe())
	go io.Copy(os.Stderr, shell.StderrPipe())

	// Wait for shell to be done
	_, err = shell.Wait()

	// If we were in a tty we let's restore state
	cleanup()

	return err
}

// checkTask makes sure that the given task is interactive and that we can connect.
func checkTask(q *queue.Queue, taskID string) error {
	task, err := q.Task(taskID)
	if err != nil {
		return fmt.Errorf("could not get the definition of task %s: %v", taskID, err)
	}
	var payload map[string]json.RawMessage
	json.Unmarshal(task.Payload, &payload)
	if _, ok := payload["features"]; !ok {
		return fmt.Errorf("task %s was created without features.interactive", taskID)
	}
	var features map[string]json.RawMessage
	json.Unmarshal(payload["features"], &features)
	if _, ok := features["interactive"]; !ok {
		return fmt.Errorf("task %s was created without features.interactive", taskID)
	}
	var interactive bool
	json.Unmarshal(features["interactive"], &interactive)
	if !interactive {
		return fmt.Errorf("task %s was created without features.interactive = true", taskID)
	}

	s, err := q.Status(taskID)
	if err != nil {
		return fmt.Errorf("could not get the status of task %s: %v", taskID, err)
	}
	lastRunState := s.Status.Runs[len(s.Status.Runs)-1].State
	lastRunDeadline := time.Time(s.Status.Runs[len(s.Status.Runs)-1].Resolved).Add(15 * time.Minute)
	if !(lastRunState == "running" || (lastRunState == "completed" && lastRunDeadline.After(time.Now().UTC()))) {
		return fmt.Errorf("task %s is not running and was not completed in the last 15 minutes", taskID)
	}

	return nil
}
