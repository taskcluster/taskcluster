package task

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/spf13/pflag"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/v90/clients/client-go"
	"github.com/taskcluster/taskcluster/v90/clients/client-go/tcqueue"
)

// runCancel cancels the runs of a given task.
func runCancel(credentials *tcclient.Credentials, args []string, out io.Writer, flagSet *pflag.FlagSet) error {
	noop, _ := flagSet.GetBool("noop")
	confirm, _ := flagSet.GetBool("confirm")

	q := makeQueue(credentials)
	taskID := args[0]

	if noop {
		return displayNoopMsg("Would cancel", credentials, args)
	}

	if confirm {
		var confirm = confirmMsg("Cancels", credentials, args)
		if !confirm {
			return nil
		}
	}

	c, err := q.CancelTask(taskID)
	if err != nil {
		log.Error(err)
		return fmt.Errorf("could not cancel the task %s: %v", taskID, err)
	}

	run := c.Status.Runs[len(c.Status.Runs)-1]
	fmt.Fprintln(out, getRunStatusString(run.State, run.ReasonResolved))
	return nil
}

// runRerun re-runs a given task.
func runRerun(credentials *tcclient.Credentials, args []string, out io.Writer, flagSet *pflag.FlagSet) error {
	noop, _ := flagSet.GetBool("noop")
	confirm, _ := flagSet.GetBool("confirm")
	force, _ := flagSet.GetBool("force")

	q := makeQueue(credentials)
	taskID := args[0]

	if noop {
		return displayNoopMsg("Would re-run", credentials, args)
	}

	if confirm {
		var confirm = confirmMsg("Will re-run", credentials, args)
		if !confirm {
			return nil
		}
	}

	if !force {
		s, err := q.Status(taskID)
		if err != nil {
			return fmt.Errorf("could not get status of the task %s: %v", taskID, err)
		}
		if s.Status.State != "failed" && s.Status.State != "exception" {
			return fmt.Errorf("task %s is in state %s. Disallowing rerun of a non-failed and non-exception task without --force", taskID, s.Status.State)
		}
	}

	c, err := q.RerunTask(taskID)
	if err != nil {
		return fmt.Errorf("could not rerun the task %s: %v", taskID, err)

	}

	run := c.Status.Runs[len(c.Status.Runs)-1]
	fmt.Fprintln(out, getRunStatusString(run.State, run.ReasonResolved))
	return nil
}

// runRetrigger re-triggers a given task.
// It will generate a new taskId, update timestamps and retries to 0
// Optionnally, you can pass '--exact' to keep stuff like:
//   - routes,
//   - dependencies,
//   - ...
//
// Otherwise, default behavior is to omit those as taskcluster-tools does:
// https://github.com/taskcluster/taskcluster-tools/blob/e8b6d45f10e7520f717b7a9f5db87d550c74d15e/src/views/UnifiedInspector/ActionsMenu.jsx#L141-L158
func runRetrigger(credentials *tcclient.Credentials, args []string, out io.Writer, flagSet *pflag.FlagSet) error {
	q := makeQueue(credentials)
	taskID := args[0]

	t, err := q.Task(taskID)
	if err != nil {
		return fmt.Errorf("could not get the task %s: %v", taskID, err)
	}

	exactRetrigger, _ := flagSet.GetBool("exact")
	editDefinition, _ := flagSet.GetString("edit-definition")

	newTaskID := slugid.Nice()
	now := time.Now().UTC()

	origCreated, err := time.Parse(time.RFC3339, t.Created.String())
	if err != nil {
		return fmt.Errorf("could not parse created date: %s", t.Created)
	}

	origDeadline, err := time.Parse(time.RFC3339, t.Deadline.String())
	if err != nil {
		return fmt.Errorf("could not parse deadline date: %s", t.Deadline)
	}

	origExpires, err := time.Parse(time.RFC3339, t.Expires.String())
	if err != nil {
		return fmt.Errorf("could not parse created date: %s", t.Expires)
	}

	// TaskDefinitionRequest: https://github.com/taskcluster/taskcluster-client-go/blob/88cfe471bfe2eb8fc9bc22d9cde6a65e74a9f3e5/tcqueue/types.go#L1368-L1549
	// TaskDefinitionResponse: https://github.com/taskcluster/taskcluster-client-go/blob/88cfe471bfe2eb8fc9bc22d9cde6a65e74a9f3e5/tcqueue/types.go#L1554-L1716

	newDependencies := []string{}
	newRoutes := []string{}
	if exactRetrigger {
		newDependencies = t.Dependencies
		newRoutes = t.Routes
	}

	newT := &tcqueue.TaskDefinitionRequest{
		Created:       tcclient.Time(now),
		Deadline:      tcclient.Time(now.Add(origDeadline.Sub(origCreated))),
		Expires:       tcclient.Time(now.Add(origExpires.Sub(origCreated))),
		TaskGroupID:   t.TaskGroupID,
		SchedulerID:   t.SchedulerID,
		WorkerType:    t.WorkerType,
		ProvisionerID: t.ProvisionerID,
		Priority:      t.Priority,
		Dependencies:  newDependencies,
		Extra:         t.Extra,
		Metadata:      t.Metadata,
		Payload:       t.Payload,
		Requires:      t.Requires,
		Retries:       0,
		Routes:        newRoutes,
		Scopes:        t.Scopes,
		Tags:          t.Tags,
	}

	if editDefinition != "" {
		edits, err := parseEditDefinition(editDefinition)
		if err != nil {
			return fmt.Errorf("invalid edit definition: %v", err)
		}

		err = applyEditsToTaskDefinition(newT, edits)
		if err != nil {
			return fmt.Errorf("failed to apply edits: %v", err)
		}
	}

	c, err := q.CreateTask(newTaskID, newT)
	if err != nil {
		return fmt.Errorf("could not create task: %v", err)
	}

	// If we got no error, that means the task was successfully submitted
	fmt.Fprintf(out, "Task %s created\n", c.Status.TaskID)
	return nil
}

// runComplete completes a given task.
func runComplete(credentials *tcclient.Credentials, args []string, out io.Writer, flagSet *pflag.FlagSet) error {
	noop, _ := flagSet.GetBool("noop")
	confirm, _ := flagSet.GetBool("confirm")

	q := makeQueue(credentials)
	taskID := args[0]

	s, err := q.Status(taskID)
	if err != nil {
		return fmt.Errorf("could not get the status of the task %s: %v", taskID, err)
	}

	if noop {
		return displayNoopMsg("Would complete", credentials, args)
	}

	if confirm {
		var confirm = confirmMsg("Will complete", credentials, args)
		if !confirm {
			return nil
		}
	}

	c, err := q.ClaimTask(taskID, fmt.Sprint(len(s.Status.Runs)-1), &tcqueue.TaskClaimRequest{
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

func parseEditDefinition(editDef string) (map[string]any, error) {
	var edits map[string]any
	err := json.Unmarshal([]byte(editDef), &edits)
	if err != nil {
		return nil, fmt.Errorf("invalid JSON format: %v", err)
	}
	return edits, nil
}

func applyEditsToTaskDefinition(taskDef *tcqueue.TaskDefinitionRequest, edits map[string]any) error {
	taskData, err := convertTaskDefToMap(taskDef)
	if err != nil {
		return fmt.Errorf("failed to convert task definition to map for editing: %v", err)
	}

	for path, value := range edits {
		err = setNestedValue(taskData, path, value)
		if err != nil {
			return fmt.Errorf("failed to set field '%s' to '%v': %v", path, value, err)
		}
	}

	updatedTaskDef, err := convertMapToTaskDef(taskData)
	if err != nil {
		return fmt.Errorf("failed to convert edited map back to task definition: %v", err)
	}

	*taskDef = *updatedTaskDef
	return nil
}

func convertTaskDefToMap(taskDef *tcqueue.TaskDefinitionRequest) (map[string]any, error) {
	data, err := json.Marshal(taskDef)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal task definition to JSON: %v", err)
	}

	var result map[string]any
	err = json.Unmarshal(data, &result)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal JSON to map: %v", err)
	}
	return result, nil
}

func convertMapToTaskDef(data map[string]any) (*tcqueue.TaskDefinitionRequest, error) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal edited data to JSON: %v", err)
	}

	var taskDef tcqueue.TaskDefinitionRequest
	err = json.Unmarshal(jsonData, &taskDef)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal JSON to task definition: %v", err)
	}
	return &taskDef, nil
}

func setNestedValue(data map[string]any, path string, value any) error {
	keys := strings.Split(path, ".")
	current := data

	for i, key := range keys[:len(keys)-1] {
		if current[key] == nil {
			current[key] = make(map[string]any)
		}

		next, ok := current[key].(map[string]any)
		if !ok {
			return fmt.Errorf("cannot set nested value: path '%s' is not an object (found %T instead)", strings.Join(keys[:i+1], "."), current[key])
		}
		current = next
	}

	current[keys[len(keys)-1]] = value
	return nil
}
