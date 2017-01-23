package group

import (
	"context"
	"fmt"
	"os"
	"sync"

	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

type arguments map[string]interface{}

// SubCommand represents the function interface of the task subcommand.
type SubCommand func(credentials *tcclient.Credentials, args arguments) bool

func runCancel(credentials *tcclient.Credentials, args arguments) bool {
	q := queue.New(credentials)
	groupID := args["<groupId>"].(string)

	tasks := make([]string, 0)
	continuation := ""
	for {
		ts, err := q.ListTaskGroup(groupID, continuation, "")
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: could not fetch tasks for group %s: %v", groupID, err)
			return false
		}

		for _, t := range ts.Tasks {
			if t.Status.State == "unscheduled" || t.Status.State == "pending" || t.Status.State == "running" {
				tasks = append(tasks, t.Status.TaskID)
			}
		}

		continuation = ts.ContinuationToken
		if continuation == "" {
			break
		}
	}

	// Here we use a waitgroup to ensure that we return once all the tasks have
	// been completed.
	wg := &sync.WaitGroup{}
	// The context allows us to exit early if any of the cancellation fails.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for _, taskID := range tasks {
		wg.Add(1)
		go func(taskID string) {
			// If we paniced on the way out, abort all the other tasks.
			defer func() {
				//recover from panic and abort
				if err := recover(); err != nil {
					fmt.Fprintln(os.Stderr, err)
					cancel()
				}
			}()

			fmt.Printf("cancelling task %s\n", taskID)
			c := make(chan error, 1)
			go func() { _, err := q.CancelTask(taskID); c <- err }()

			// we select the first that returns or closes:
			// - ctx.Done() if we aborted;
			// - c if we got a completed cancellation.
			select {
			case <-ctx.Done():
				// nothing
			case err := <-c:
				if err != nil {
					panic(fmt.Errorf("could not cancel task %s: %v", taskID, err))
				}
			}
			// if we exited normally, we indicate that we completed.
			wg.Done()
		}(taskID)
	}
	// change the semantics o the waitgroup to close a channel instead
	regularExit := make(chan bool, 0)
	go func() { wg.Wait(); close(regularExit) }()

	// We select the first that closes:
	// - ctx.Done() if we aborted;
	// - regularExit if all the goroutine exited manually.
	select {
	case <-ctx.Done():
		fmt.Fprintln(os.Stderr, "error: could not cancel all tasks")
		return false
	case <-regularExit:
		return true
	}
}
