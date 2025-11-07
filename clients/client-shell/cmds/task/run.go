package task

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/v93/clients/client-go"
	"github.com/taskcluster/taskcluster/v93/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v93/clients/client-shell/config"
)

var (
	runCmd = &cobra.Command{
		Use:     "run <image> <command>",
		Short:   "creates and schedules a task through a 'docker run'-like interface.",
		PreRunE: checkRunFlags,
		RunE:    runRunTask,
	}

	now = time.Now().UTC()

	runPayload = &tcqueue.TaskDefinitionRequest{
		SchedulerID: "taskcluster-cli",

		Created:  tcclient.Time(now),
		Deadline: tcclient.Time(now.Add(24 * time.Hour)),
		Expires:  tcclient.Time(now.Add(24*time.Hour).AddDate(1, 0, 0)),
	}

	requiredFlags = []string{
		"provisioner",
		"worker-type",
	}
)

func init() {
	fs := runCmd.Flags()

	fs.StringVar(&runPayload.ProvisionerID, "provisioner", "", "ID of the provisioner to use")
	fs.StringVar(&runPayload.WorkerType, "worker-type", "", "Type of worker to use within the provisioner")
	fs.StringSliceP("env", "e", []string{}, "Environment variable to add to the task's environment (repeatable) (format: VARIABLE=VALUE)")
	fs.StringVar(&runPayload.Metadata.Name, "name", "Taskcluster-cli Task", "Human readable name of the task")
	fs.StringVar(&runPayload.Metadata.Description, "description", "Created by Taskcluster-cli", "Human readable description of the task")
	fs.StringVar(&runPayload.Metadata.Owner, "owner", "name@example.com", "Email of the task's owner")
	fs.StringVar(&runPayload.Metadata.Source, "source", "http://taskcluster-cli/task/run", "URL pointing to the source of the task")
	fs.StringSliceVar(&runPayload.Dependencies, "dependency", []string{}, "TaskID of a dependency (repeatable)")
	var retries int
	fs.IntVar(&retries, "retries", 5, "Number of retries due to infrastructure issues")
	runPayload.Retries = int64(retries)

	for _, f := range requiredFlags {
		err := runCmd.MarkFlagRequired(f)
		if err != nil {
			panic(fmt.Sprintf("Cannot mark flag required: %s", err))
		}
	}

	Command.AddCommand(runCmd)
}

// checkRunFlags checks that the required flags were specified.
func checkRunFlags(cmd *cobra.Command, args []string) error {
	for _, f := range requiredFlags {
		if !cmd.Flag(f).Changed {
			return fmt.Errorf("flag '%s' is required", f)
		}
	}
	if owner := stringFlagHelper(cmd.Flags(), "owner"); !regexp.MustCompile(".+@.+").MatchString(owner) {
		return errors.New("owner must be an email-like string")
	}
	return nil
}

// runRunTask takes the task creation payload and runs the task.
func runRunTask(cmd *cobra.Command, args []string) error {
	if len(args) < 2 {
		return errors.New("run requires at least 2 arguments: image and command")
	}

	var creds *tcclient.Credentials
	if config.Credentials != nil {
		creds = config.Credentials.ToClientCredentials()
	}

	// Generate a new taskID
	taskID := slugid.Nice()
	runPayload.TaskGroupID = taskID

	// Build the environment variables.
	env := make(map[string]string)
	envs, err := cmd.Flags().GetStringSlice("env")
	if err != nil {
		return err
	}
	for _, e := range envs {
		p := strings.SplitN(e, "=", 2)
		switch len(p) {
		case 2:
			env[p[0]] = p[1]
		case 1:
			env[p[0]] = ""
		default:
			return fmt.Errorf("invalid environment option: %s", e)
		}
	}

	// Build the task payload.
	runPayload.Payload, err = json.Marshal(struct {
		Image       string            `json:"image"`
		Command     []string          `json:"command"`
		Environment map[string]string `json:"env"`
		MaxRunTime  int               `json:"maxRunTime"`
	}{
		Image:       args[0],
		Command:     args[1:],
		Environment: env,
		MaxRunTime:  7200, // 2 hours
	})
	if err != nil {
		return fmt.Errorf("could not marshal execution payload: %v", err)
	}

	q := tcqueue.New(creds, config.RootURL())
	resp, err := q.CreateTask(taskID, runPayload)
	if err != nil {
		return fmt.Errorf("could not create task: %v", err)
	}

	// If we got no error, that means the task was successfully rund
	fmt.Fprintf(cmd.OutOrStdout(), "Task %s created\n", resp.Status.TaskID)

	return nil
}
