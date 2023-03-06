package group

import (
	"fmt"
	"html/template"
	"io"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	tcclient "github.com/taskcluster/taskcluster/v48/clients/client-go"
	"github.com/taskcluster/taskcluster/v48/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v48/clients/client-shell/config"
)

var listFormat string

func init() {
	statusCmd := &cobra.Command{
		Use:   "status <taskGroupId>",
		Short: "Show the status of a task group",
		RunE:  executeHelperE(runStatus),
	}

	Command.AddCommand(statusCmd)

	listCmd := &cobra.Command{
		Use:   "list <taskGroupId>",
		Short: "List task details: ID and label",
		RunE:  executeHelperE(runList),
	}
	listCmd.Flags().BoolP("all", "a", false, "Include all tasks (Overrides other options).")

	listCmd.Flags().BoolP("running", "r", false, "Include running tasks.")
	listCmd.Flags().BoolP("failed", "f", false, "Include failed tasks.")
	listCmd.Flags().BoolP("exception", "e", false, "Include exception tasks.")
	listCmd.Flags().BoolP("complete", "c", false, "Include complete tasks.")
	listCmd.Flags().BoolP("unscheduled", "u", false, "Include unscheduled tasks.")
	listCmd.Flags().BoolP("pending", "p", false, "Include pending tasks.")

	listCmd.Flags().StringVar(&listFormat, "format-string", "{{ .Status.TaskID }} {{ .Task.Metadata.Name }} {{ .Status.State }}", "Go Template string for output")

	Command.AddCommand(listCmd)
}

func makeQueue(credentials *tcclient.Credentials) *tcqueue.Queue {
	return tcqueue.New(credentials, config.RootURL())
}

// runStatus displays the status summary of tasks in a group.
//
// It first fetches the list of all tasks associated with the given group,
// then counts the unique states of the final run of each task
func runStatus(credentials *tcclient.Credentials, args []string, out io.Writer, flags *pflag.FlagSet) error {
	q := makeQueue(credentials)
	groupID := args[0]

	counter := make(map[string]int)

	cont := ""

	for {
		// get next TaskGroup for groupID
		ts, err := q.ListTaskGroup(groupID, cont, "")
		if err != nil {
			return fmt.Errorf("could not fetch tasks for group %s: %v", groupID, err)
		}

		for _, t := range ts.Tasks {
			counter[t.Status.State]++
		}

		// break if there are no more tasks for that groupID
		if cont = ts.ContinuationToken; cont == "" {
			break
		}
	}

	for status, count := range counter {
		fmt.Fprintf(out, "%s: %d\n", status, count)
	}

	return nil
}

// runList displays the a list of task IDs and labels that match the given statuses
//
// It first fetches the list of all tasks associated with the given group
func runList(credentials *tcclient.Credentials, args []string, out io.Writer, flags *pflag.FlagSet) error {
	q := makeQueue(credentials)
	groupID := args[0]

	cont := ""

	templ := template.Must(template.New("listFormat").Parse(strings.Join([]string{listFormat, "\n"}, "")))

	for {
		// get next TaskGroup for groupID
		ts, err := q.ListTaskGroup(groupID, cont, "")
		if err != nil {
			return fmt.Errorf("could not fetch tasks for group %s: %v", groupID, err)
		}

		for _, t := range ts.Tasks {
			if filterListTask(t.Status, flags) {
				err := templ.Execute(out, t)
				if err != nil {
					return err
				}
			}
		}

		// break if there are no more tasks for that groupID
		if cont = ts.ContinuationToken; cont == "" {
			break
		}
	}

	return nil
}

// filterListTask takes a task and returns whether or not this task should be
// included in the list requested by the user
func filterListTask(status tcqueue.TaskStatusStructure, flags *pflag.FlagSet) bool {
	if include, err := flags.GetBool("all"); include && err == nil {
		return true
	}
	if include, err := flags.GetBool(status.State); include && err == nil {
		return true
	}
	return false
}
