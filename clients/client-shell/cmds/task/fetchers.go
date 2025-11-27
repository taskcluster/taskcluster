package task

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/spf13/pflag"
	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v94/clients/client-shell/config"
)

func makeQueue(credentials *tcclient.Credentials) *tcqueue.Queue {
	return tcqueue.New(credentials, config.RootURL())
}

// runStatus gets the status of run(s) of a given task.
func runStatus(credentials *tcclient.Credentials, args []string, out io.Writer, flagSet *pflag.FlagSet) error {
	q := makeQueue(credentials)
	taskID := args[0]

	s, err := q.Status(taskID)
	if err != nil {
		return fmt.Errorf("could not get the status of the task %s: %v", taskID, err)
	}

	allRuns, _ := flagSet.GetBool("all-runs")
	runID, _ := flagSet.GetInt("run")

	if allRuns && runID != -1 {
		return fmt.Errorf("can't specify both all-runs and a specific run")
	}

	if allRuns {
		for _, r := range s.Status.Runs {
			fmt.Fprintf(out, "Run #%d: %s\n", r.RunID, getRunStatusString(r.State, r.ReasonResolved))
		}
		return nil
	}

	if runID >= len(s.Status.Runs) {
		return fmt.Errorf("there is no run #%v", runID)
	}
	if runID == -1 {
		runID = len(s.Status.Runs) - 1
	}

	fmt.Fprintln(out, getRunStatusString(s.Status.Runs[runID].State, s.Status.Runs[runID].ReasonResolved))
	return nil
}

// confirmMsg displays confirmation message when --confirm is used
func confirmMsg(command string, credentials *tcclient.Credentials, args []string) bool {

	q := makeQueue(credentials)
	taskID := args[0]

	c, err := q.Status(taskID)
	if err != nil {
		log.Fatal(err)
	}
	run := c.Status.Runs[len(c.Status.Runs)-1]

	t, err := q.Task(taskID)
	if err != nil {
		log.Fatal(err)
	}

	reader := bufio.NewReader(os.Stdin)

	for {
		fmt.Printf("%s %s taskId: %s (state: %s). Are you sure you want to proceed?(y/N) ", command, t.Metadata.Name, taskID, run.State)

		response, err := reader.ReadString('\n')
		if err != nil {
			log.Fatal(err)
		}

		response = strings.ToLower(strings.TrimSpace(response))

		switch response {
		case "y", "yes":
			return true
		case "n", "no", "":
			return false
		}
	}
}

// displayNoopMsg displays details when --noop is used
func displayNoopMsg(command string, credentials *tcclient.Credentials, args []string) error {
	q := makeQueue(credentials)
	taskID := args[0]

	c, _ := q.Status(taskID)
	run := c.Status.Runs[len(c.Status.Runs)-1]

	t, err := q.Task(taskID)
	if err != nil {
		return fmt.Errorf("could not get the task %s: %v", taskID, err)
	}

	fmt.Printf("%s %s taskid: %s (state: %s)\n", command, t.Metadata.Name, taskID, run.State)
	return nil
}

// runName gets the name of a given task.
func runName(credentials *tcclient.Credentials, args []string, out io.Writer, _ *pflag.FlagSet) error {
	q := makeQueue(credentials)
	taskID := args[0]

	t, err := q.Task(taskID)
	if err != nil {
		return fmt.Errorf("could not get the task %s: %v", taskID, err)
	}

	fmt.Fprintln(out, t.Metadata.Name)
	return nil
}

// runDef gets the definition of a given task.
func runDef(credentials *tcclient.Credentials, args []string, out io.Writer, _ *pflag.FlagSet) error {
	q := makeQueue(credentials)
	taskID := args[0]

	t, err := q.Task(taskID)
	if err != nil {
		return fmt.Errorf("could not get the task %s: %v", taskID, err)
	}

	def, err := json.MarshalIndent(t, "", "  ")
	if err != nil {
		return fmt.Errorf("unable to marshal task %s into json: %v", taskID, err)
	}

	fmt.Fprintln(out, string(def))
	return nil
}

// runGroup gets the groupID of a given task.
func runGroup(credentials *tcclient.Credentials, args []string, out io.Writer, _ *pflag.FlagSet) error {
	q := makeQueue(credentials)
	taskID := args[0]

	t, err := q.Task(taskID)
	if err != nil {
		return fmt.Errorf("could not get the task %s: %v", taskID, err)
	}

	fmt.Fprintln(out, t.TaskGroupID)
	return nil
}

// runArtifacts gets the name of the artificats for a given task and run.
func runArtifacts(credentials *tcclient.Credentials, args []string, out io.Writer, flagSet *pflag.FlagSet) error {
	q := makeQueue(credentials)
	taskID := args[0]

	s, err := q.Status(taskID)
	if err != nil {
		return fmt.Errorf("could not get the status of the task %s: %v", taskID, err)
	}

	runID, _ := flagSet.GetInt("run")
	if runID >= len(s.Status.Runs) {
		return fmt.Errorf("there is no run #%v", runID)
	}
	if runID == -1 {
		runID = len(s.Status.Runs) - 1
	}

	buf := bytes.NewBufferString("")
	continuation := ""
	for {
		a, err := q.ListArtifacts(taskID, fmt.Sprint(runID), continuation, "")
		if err != nil {
			return fmt.Errorf("could not fetch artifacts for task %s run %v: %v", taskID, runID, err)
		}

		for _, ar := range a.Artifacts {
			fmt.Fprintf(buf, "%s\n", ar.Name)
		}

		continuation = a.ContinuationToken
		if continuation == "" {
			break
		}
	}

	_, err = buf.WriteTo(out)
	return err
}

func runLog(credentials *tcclient.Credentials, args []string, out io.Writer, flagSet *pflag.FlagSet) error {
	q := makeQueue(credentials)
	taskID := args[0]

	s, err := q.Status(taskID)
	if err != nil {
		return fmt.Errorf("could not get the status of the task %s: %v", taskID, err)
	}

	state := s.Status.State
	if state == "unscheduled" || state == "pending" {
		return fmt.Errorf("could not fetch the logs of task %s because it's in a %s state", taskID, state)
	}

	path := tcurls.API(config.RootURL(), "queue", "v1", "task/"+taskID+"/artifacts/public/logs/live.log")

	resp, err := http.Get(path)
	if err != nil {
		return fmt.Errorf("error making request to %v: %v", path, err)
	}
	defer resp.Body.Close()

	// Read line by line for live logs.
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		fmt.Fprintln(out, scanner.Text())
	}

	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("received unexpected response code %v", resp.StatusCode)
	}

	return nil
}
