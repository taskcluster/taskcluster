package task

import (
	"fmt"
	"os"
	"strconv"

	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

type arguments map[string]interface{}

// SubCommand represents the function interface of the task subcommand.
type SubCommand func(credentials *tcclient.Credentials, args arguments) bool

func extractRunID(max int, param interface{}) (runID int, err error) {
	runID = max

	if param == nil {
		return
	}

	if str, ok := param.(string); ok {
		var id int
		if id, err = strconv.Atoi(str); err == nil {
			if id >= 0 && id < max {
				runID = id
			} else {
				err = fmt.Errorf("given runID is out of range: %v", id)
			}
		}
	} else {
		err = fmt.Errorf("runID is not a string: %v", str)
	}

	return
}

func (task) runStatus(credentials *tcclient.Credentials, args arguments) bool {
	q := queue.New(credentials)
	taskID := args["<taskId>"].(string)

	s, err := q.Status(taskID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: could not get the status of the task %s: %v\n", taskID, err)
		return false
	}

	if args["--all-runs"].(bool) {
		for _, r := range s.Status.Runs {
			fmt.Printf("Run #%d: %s\n", r.RunID, r.State)
		}
		return true
	}

	run, err := extractRunID(len(s.Status.Runs)-1, args["--run"])
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: invalid runID: %v\n", err)
		return false
	}

	fmt.Println(s.Status.Runs[run].State)
	return true
}

func (task) runName(credentials *tcclient.Credentials, args arguments) bool {
	q := queue.New(credentials)
	taskID := args["<taskId>"].(string)

	t, err := q.Task(taskID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: could not get the task %s: %v\n", taskID, err)
		return false
	}

	fmt.Println(t.Metadata.Name)
	return true
}

func (task) runGroup(credentials *tcclient.Credentials, args arguments) bool {
	q := queue.New(credentials)
	taskID := args["<taskId>"].(string)

	t, err := q.Task(taskID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: could not get the task %s: %v\n", taskID, err)
		return false
	}

	fmt.Println(t.TaskGroupID)
	return true
}
