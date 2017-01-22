package task

import (
	"fmt"
	"os"

	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

type arguments map[string]interface{}

func (task) runStatus(credentials *tcclient.Credentials, args arguments) bool {
	q := queue.New(credentials)
	taskID := args["<taskId>"].(string)

	s, err := q.Status(taskID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: could not get the status of the task %s: %v", taskID, err)
		return false
	}

	if args["--all-runs"].(bool) {
		for _, r := range s.Status.Runs {
			fmt.Printf("Run #%d: %s\n", r.RunID, r.State)
		}
	} else {
		fmt.Println(s.Status.Runs[len(s.Status.Runs)-1].State)
	}
	return true
}

func (task) runName(credentials *tcclient.Credentials, args arguments) bool {
	q := queue.New(credentials)
	taskID := args["<taskId>"].(string)

	t, err := q.Task(taskID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: could not get the task %s: %v", taskID, err)
		return false
	}

	fmt.Println(t.Metadata.Name)
	return true
}
