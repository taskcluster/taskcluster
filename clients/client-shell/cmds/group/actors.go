package group

import (
	"context"
	"fmt"
	"html/template"
	"io"
	"strings"
	"sync"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	tcclient "github.com/taskcluster/taskcluster/v47/clients/client-go"
	"github.com/taskcluster/taskcluster/v47/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v47/clients/client-shell/config"
)

var listFormat string

func init() {
	cancelCmd := &cobra.Command{
		Use:   "cancel <taskGroupId>",
		Short: "Cancel a whole group by taskGroupId.",
		RunE:  executeHelperE(runCancel),
	}
	cancelCmd.Flags().StringP("worker-type", "w", "", "Only cancel tasks with a certain worker type.")
	cancelCmd.Flags().BoolP("force", "f", false, "Skip cancellation confirmation.")

	Command.AddCommand(cancelCmd)

	statusCmd := &cobra.Command{
		Use:   "status <taskGroupId>",
		Short: "Show the status of a task group",
		RunE:  executeHelperE(runStatus),
	}

	Command.AddCommand(statusCmd)

	sealCmd := &cobra.Command{
		Use:   "seal <taskGroupId>",
		Short: "Seal the task group to disallow addition of new tasks",
		Long:  "This operation is irreversible and calling it multiple times will only seal it once.",
		RunE:  executeHelperE(runSeal),
	}
	sealCmd.Flags().BoolP("force", "f", false, "Skip sealing confirmation.")

	Command.AddCommand(sealCmd)

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

// runCancel cancels all tasks of a group.
//
// It first fetches the list of all tasks associated with the given group,
// then filters for only cancellable tasks (unscheduled, pending, running),
// and finally runs all cancellations concurrently, because they are
// independent of each other.
func runCancel(credentials *tcclient.Credentials, args []string, out io.Writer, flags *pflag.FlagSet) error {
	q := makeQueue(credentials)
	groupID := args[0]

	// Because the list of tasks can be arbitrarily long, we have to loop until
	// we are told not to.
	tasks := make([]string, 0)
	tasksNames := make([]string, 0)
	cont := ""

	for {
		// get next TaskGroup for groupID
		ts, err := q.ListTaskGroup(groupID, cont, "")
		if err != nil {
			return fmt.Errorf("could not fetch tasks for group %s: %v", groupID, err)
		}

		// set tasks that meet the criteria (see filterTask) to be deleted
		for _, t := range ts.Tasks {
			if filterTask(t.Status, flags) {
				// add id to be deleted, and name for cancellation
				tasks = append(tasks, t.Status.TaskID)
				tasksNames = append(tasksNames, t.Task.Metadata.Name)
			}
		}

		// break if there are no more tasks for that groupID
		if cont = ts.ContinuationToken; cont == "" {
			break
		}
	}

	if len(tasks) == 0 {
		fmt.Fprintln(out, "No suitable tasks found for cancellation.")
		return nil
	}

	// ask for confirmation before cancellation
	if force, _ := flags.GetBool("force"); !force && !confirmCancellation(tasks, tasksNames, out) {
		fmt.Fprintln(out, "Cancellation of tasks aborted.")
		return nil
	}

	// Here we use a waitgroup to ensure that we return once all the tasks have
	// been completed.
	wg := &sync.WaitGroup{}
	// The context allows us to exit early if any of the cancellation fails.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	// errChan allows the first request that panics to propagate the error message
	// up to us.
	errChan := make(chan error, 1)

	for _, taskID := range tasks {
		wg.Add(1)
		go func(taskID string) {
			// If we panicked on the way out, abort all the other tasks.
			defer func() {
				//recover from panic and abort
				if err := recover(); err != nil {
					if e, ok := err.(error); ok {
						errChan <- e
					} else {
						errChan <- fmt.Errorf("%v", err)
					}
					cancel()
				}
			}()

			fmt.Fprintf(out, "cancelling task %s\n", taskID)
			c := make(chan error, 1)
			go func() { _, err := q.CancelTask(taskID); c <- err }()

			// we select the first that returns or closes:
			// - ctx.Done() if we aborted;
			// - c if we got a completed cancellation.
			select {
			case <-ctx.Done():
				// nothing because we can't cancel the existing requests.
			case err := <-c:
				if err != nil {
					panic(fmt.Errorf("could not cancel task %s: %v", taskID, err))
				}
			}
			// if we exited normally, we indicate that we completed.
			wg.Done()
		}(taskID)
	}
	// change the semantics of waitgroup to close a channel instead of blocking
	// the main thread.
	regularExit := make(chan bool)
	go func() { wg.Wait(); close(regularExit) }()

	// We select the first that closes:
	// - ctx.Done() if we aborted;
	// - regularExit if all the goroutine exited manually.
	select {
	case <-ctx.Done():
		return fmt.Errorf("could not cancel all tasks: %v", <-errChan)
	case <-regularExit:
		return nil
	}
}

// filterTask takes a task and returns whether or not this task should be
// set for cancellation, based on the specified filters through flags
func filterTask(status tcqueue.TaskStatusStructure, flags *pflag.FlagSet) bool {
	// first check - only delete tasks that are unscheduled, pending, running
	if status.State != "unscheduled" && status.State != "pending" && status.State != "running" {
		return false
	}

	// filter for worker type, if one specified
	// if no worker type is specified, its value is "" so the condition is skipped
	if workerType, _ := flags.GetString("worker-type"); workerType != "" {
		if workerType != status.WorkerType {
			return false
		}
	}

	// ..other filters can be added here as necessary

	return true
}

// confirmCancellation lists the tasks to be cancelled and prompts to confirm cancellation
func confirmCancellation(ids []string, names []string, out io.Writer) bool {
	// list tasks
	fmt.Fprintf(out, "The following %d tasks will be cancelled:\n", len(ids))

	for n, id := range ids {
		fmt.Fprintf(out, "\tTask %s: %s\n", id, names[n])
	}

	for {
		fmt.Fprint(out, "Are you sure you want to cancel these tasks? [y/n] ")

		var c string
		fmt.Scanf("%s", &c)

		if c == "y" || c == "Y" {
			return true
		} else if c == "n" || c == "N" {
			return false
		}
		// otherwise reloop to ask again
	}
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

// confirmSealing displays task group and prompts to confirm sealing
func confirmSealing(groupID string, out io.Writer) bool {
	fmt.Fprintf(out, "The following task group %s will be cancelled.\n", groupID)

	for {
		fmt.Fprint(out, "Are you sure you want to seal this group and prevent new tasks from being added to it? [y/n] ")

		var c string
		fmt.Scanf("%s", &c)

		if c == "y" || c == "Y" {
			return true
		} else if c == "n" || c == "N" {
			return false
		}
		// otherwise reloop to ask again
	}
}

// runSeal performs task group sealing
func runSeal(credentials *tcclient.Credentials, args []string, out io.Writer, flags *pflag.FlagSet) error {
	q := makeQueue(credentials)
	groupID := args[0]

	// ask for confirmation before cancellation
	if force, _ := flags.GetBool("force"); !force && !confirmSealing(groupID, out) {
		fmt.Fprintln(out, "Sealing of task group aborted.")
		return nil
	}

	updated, err := q.SealTaskGroup(groupID)
	if err != nil {
		return fmt.Errorf("could not seal task group %s: %v", groupID, err)
	}

	fmt.Fprintf(out, `Task Group sealed:
taskGroupId: %s
schedulerId: %s
expires:     %s
sealed:      %s
`, updated.TaskGroupID, updated.SchedulerID, updated.Expires, updated.Sealed)

	return nil
}
