package group

import (
	"fmt"
	"io"
	"sync"

	"github.com/spf13/pflag"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"golang.org/x/net/context"
)

// runCancel cancels all tasks of a group.
//
// It first fetches the list of all tasks associated with the given group,
// then filters for only cancellable tasks (unscheduled, pending, running),
// and finally runs all cancellations concurrently, because they are
// independent of each other.
func runCancel(credentials *tcclient.Credentials, args []string, out io.Writer, _ *pflag.FlagSet) error {
	q := queue.New(credentials)
	groupID := args[0]

	// Because the list of tasks can be arbitrarily long, we have to loop until
	// we are told not to.
	tasks := make([]string, 0)
	continuation := ""
	for {
		ts, err := q.ListTaskGroup(groupID, continuation, "")
		if err != nil {
			return fmt.Errorf("could not fetch tasks for group %s: %v", groupID, err)
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
