package task

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-cli/config"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

var (
	createCmd = &cobra.Command{
		Use:     "create <image> <command>",
		Short:   "Creates and schedules a task, using the specified taskId if given.",
		PreRunE: checkCreateFlags,
		RunE:    runCreateTask,
	}

	now = time.Now().UTC()

	createPayload = &queue.TaskDefinitionRequest{
		SchedulerID: "taskcluster-cli",

		Created:  tcclient.Time(now),
		Deadline: tcclient.Time(now.Add(24 * time.Hour)),
		Expires:  tcclient.Time(now.Add(24*time.Hour).AddDate(1, 0, 0)),
	}
)

func init() {
	fs := createCmd.Flags()

	fs.String("task-id", "", "taskID of the task, if omitted, a new one will be assigned")
	fs.StringVar(&createPayload.ProvisionerID, "provisioner", "", "ID of the provisioner to use")
	fs.StringVar(&createPayload.WorkerType, "worker-type", "", "worker-type to use within the provisioner")
	fs.StringSliceP("env", "e", []string{}, "Environment variable to add to the task's environment (repeatable) (format: VARIABLE=VALUE)")
	fs.StringVar(&createPayload.Metadata.Name, "name", "", "Human readable name of the task")
	fs.StringVar(&createPayload.Metadata.Description, "description", "", "Human readable description of the task")
	fs.StringVar(&createPayload.Metadata.Owner, "owner", "", "Email of the task's owner")
	fs.StringVar(&createPayload.Metadata.Source, "source", "", "URL pointing to the source of the task")
	fs.StringSliceVar(&createPayload.Dependencies, "dependency", []string{}, "TaskID of a dependency (repeatable)")
	fs.IntVar(&createPayload.Retries, "retries", 5, "Number of retries due to infrastructure issues")

	for _, f := range []string{"provisioner", "worker-type"} {
		createCmd.MarkFlagRequired(f)
	}

	Command.AddCommand(createCmd)
}

// checkCreateFlags checks that the required flags were specified.
func checkCreateFlags(cmd *cobra.Command, args []string) error {
	for _, f := range []string{"provisioner", "worker-type"} {
		if !cmd.Flag(f).Changed {
			return fmt.Errorf("flag '%s' is required", f)
		}
	}
	return nil
}

// runCreateTask takes the task creation payload and creates the task.
func runCreateTask(cmd *cobra.Command, args []string) error {
	if len(args) < 2 {
		return errors.New("create requires at least 2 arguments: image and command")
	}

	var creds *tcclient.Credentials
	if config.Credentials != nil {
		creds = config.Credentials.ToClientCredentials()
	}

	// Either generates a new taskID or uses the one provided on the CLI.
	var taskID string
	if s := stringFlagHelper(cmd.Flags(), "task-id"); s != "" {
		if slugid.Decode(s) != nil {
			taskID = s
		} else {
			return fmt.Errorf("task id '%s' is not a valid slugid", s)
		}
	} else {
		taskID = slugid.V4()
	}
	createPayload.TaskGroupID = taskID

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
	createPayload.Payload, err = json.Marshal(struct {
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

	// Arbitrary URL to match the metadata spec.
	if createPayload.Metadata.Source == "" {
		createPayload.Metadata.Source = "http://taskcluster-cli/task/create"
	}

	// Adds a tag to indicate that this task was built through tccli.
	tags := make(map[string]string)
	tags["misc_info"] = "created by taskcluster-cli"
	createPayload.Tags, err = json.Marshal(tags)
	if err != nil {
		return fmt.Errorf("could not marshal tags: %v", err)
	}

	q := queue.New(creds)
	resp, err := q.CreateTask(taskID, createPayload)
	if err != nil {
		return fmt.Errorf("could not create task: %v", err)
	}

	// If we got no error, that means the task was successfully created
	fmt.Fprintf(cmd.OutOrStdout(), "Task %s created\n", resp.Status.TaskID)

	return nil
}
