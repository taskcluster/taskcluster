package taskcluster

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// This is an incomplete mapping of tasks from taskcluster...
type queueTask struct {
	// only scopes are needed
	Scopes []string `json:"scopes"`
}

var taskUrl = "https://queue.taskcluster.net/v1/task/%s"

// Fetch a task from the taskcluster queue.
func GetTask(taskId string) (*queueTask, error) {
	resp, err := http.Get(fmt.Sprintf(taskUrl, taskId))

	if err != nil {
		return nil, err
	}

	// Cleanup after ourselves...
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Task could not be found: %s", resp.Status)
	}

	// Decode the task.
	decoder := json.NewDecoder(resp.Body)
	var taskResult queueTask
	decodeErr := decoder.Decode(&taskResult)
	if decodeErr != nil {
		return nil, decodeErr
	}

	return &taskResult, nil
}
