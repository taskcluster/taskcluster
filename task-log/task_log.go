package taskLog

import (
	"bufio"
	"fmt"
	"net/http"

	"github.com/taskcluster/taskcluster-cli/extpoints"
)

type taskLog struct{}

func init() {
	extpoints.Register("task-log", taskLog{})
}

func (taskLog) ConfigOptions() map[string]extpoints.ConfigOption {
	return nil
}

func (taskLog) Summary() string {
	return "Outputs the logs for <taskID> as generated, and exits when completes."
}

func (taskLog) Usage() string {
	usage := "Usage: taskcluster task-log <taskID>\n"
	return usage
}

func (taskLog) Execute(context extpoints.Context) bool {
	taskID := context.Arguments["<taskID>"].(string)

	path := "https://queue.taskcluster.net/v1/task/" + taskID + "/artifacts/public/logs/live.log"

	resp, err := http.Get(path)
	if err != nil {
		panic("Error making request to " + path)
	}

	defer resp.Body.Close()

	// Read line by line for live logs.
	// This will also print the error message for failed requests.
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		fmt.Println(scanner.Text())
	}

	return resp.StatusCode == 200
}
