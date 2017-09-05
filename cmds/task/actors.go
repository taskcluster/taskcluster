package task

import (
	"fmt"
	"io"
	"os"

	"github.com/spf13/pflag"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

// runCancel cancels the runs of a given task.
func runCancel(credentials *tcclient.Credentials, args []string, out io.Writer, _ *pflag.FlagSet) error {
	q := makeQueue(credentials)
	taskID := args[0]

	c, err := q.CancelTask(taskID)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return fmt.Errorf("could not cancel the task %s: %v", taskID, err)
	}

	run := c.Status.Runs[len(c.Status.Runs)-1]
	fmt.Fprintln(out, getRunStatusString(run.State, run.ReasonResolved))
	return nil
}

// runRerun re-runs a given task.
func runRerun(credentials *tcclient.Credentials, args []string, out io.Writer, _ *pflag.FlagSet) error {
	q := makeQueue(credentials)
	taskID := args[0]

	c, err := q.RerunTask(taskID)
	if err != nil {
		return fmt.Errorf("could not rerun the task %s: %v", taskID, err)
	}

	run := c.Status.Runs[len(c.Status.Runs)-1]
	fmt.Fprintln(out, getRunStatusString(run.State, run.ReasonResolved))
	return nil
}

// runComplete completes a given task.
func runComplete(credentials *tcclient.Credentials, args []string, out io.Writer, _ *pflag.FlagSet) error {
	q := makeQueue(credentials)
	taskID := args[0]

	s, err := q.Status(taskID)
	if err != nil {
		return fmt.Errorf("could not get the status of the task %s: %v", taskID, err)
	}

	c, err := q.ClaimTask(taskID, fmt.Sprint(len(s.Status.Runs)-1), &queue.TaskClaimRequest{
		WorkerGroup: s.Status.WorkerType,
		WorkerID:    "taskcluster-cli",
	})
	if err != nil {
		return fmt.Errorf("could not claim the task %s: %v", taskID, err)
	}

	wq := makeQueue(&tcclient.Credentials{
		ClientID:    c.Credentials.ClientID,
		AccessToken: c.Credentials.AccessToken,
		Certificate: c.Credentials.Certificate,
	})
	r, err := wq.ReportCompleted(taskID, fmt.Sprint(c.RunID))
	if err != nil {
		return fmt.Errorf("could not complete the task %s: %v", taskID, err)
	}

	fmt.Fprintln(out, getRunStatusString(r.Status.Runs[c.RunID].State, r.Status.Runs[c.RunID].ReasonResolved))
	return nil
}
