package group

import (
	"fmt"
	"io"
	"sync"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"golang.org/x/net/context"
)

func init() {
	cancelCmd := &cobra.Command{
		Use:   "cancel <taskGroupId>",
		Short: "Cancel a whole group by taskGroupId.",
		RunE:  executeHelperE(runCancel),
	}
	cancelCmd.Flags().StringP("worker-type", "w", "", "Only cancel tasks with a certain worker type.")

	Command.AddCommand(cancelCmd)
}

// runCancel cancels all tasks of a group.
//
// It first fetches the list of all tasks associated with the given group,
// then filters for only cancellable tasks (unscheduled, pending, running),
// and finally runs all cancellations concurrently, because they are
// independent of each other.
func runCancel(credentials *tcclient.Credentials, args []string, out io.Writer, flags *pflag.FlagSet) error {
	q := queue.New(credentials)
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
	if !confirmCancellation(tasks, tasksNames, out) {
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
			// If we paniced on the way out, abort all the other tasks.
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
func filterTask(status queue.TaskStatusStructure, flags *pflag.FlagSet) bool {
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

	// TODO add other filters here when necessary

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
