package task

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	tcclient "github.com/taskcluster/taskcluster/v90/clients/client-go"
	"github.com/taskcluster/taskcluster/v90/clients/client-go/tcqueue"
)

// returns the test status on request
func cancelHandler(w http.ResponseWriter, _ *http.Request) {
	status := `{
				  "status": {
				    "state": "cancelled",
				    "runs": [
				      {
				        "runId": 0,
				        "state": "cancelled",
				        "reasonCreated": "scheduled",
				        "reasonResolved": "cancelled"
				      }
				    ]
				  }
				}`
	_, _ = io.WriteString(w, status)
}

// returns the test status on request
func reRunHandler(w http.ResponseWriter, _ *http.Request) {
	status := `{
				  "status": {
				    "state": "completed",
				    "runs": [
				      {
				        "runId": 0,
				        "state": "running",
				        "reasonCreated": "scheduled",
				        "reasonResolved": "running"
				      }
				    ]
				  }
				}`
	_, _ = io.WriteString(w, status)
}

// returns the test status on request
func claimTaskHandler(w http.ResponseWriter, _ *http.Request) {
	status := `{
				  "status": {
				  	"workerType": "tutorial",
				    "state": "completed",
				    "runs": [
				      {
				        "runId": 0,
				        "state": "running",
				        "reasonCreated": "scheduled",
				        "reasonResolved": "running"
				      }
				    ]
				  }
				}`
	_, _ = io.WriteString(w, status)
}

func (suite *FakeServerSuite) TestRunCancelCommand() {
	// set up to run a command and capture output
	buf, cmd := setUpCommand()

	// run the command
	args := []string{fakeTaskID}
	assert.NoError(suite.T(), runCancel(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags()))

	suite.Equal("cancelled 'cancelled'\n", buf.String())
}

func (suite *FakeServerSuite) TestRunRerunCommandForce() {
	// set up to run a command and capture output
	buf, cmd := setUpCommand()
	cmd.Flags().Bool("force", true, "")

	// run the command
	args := []string{fakeTaskID}
	assert.NoError(suite.T(), runRerun(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags()))

	suite.Equal("running 'running'\n", buf.String())
}

func (suite *FakeServerSuite) TestRunRerunCommandNoForce() {
	// set up to run a command and capture output
	_, cmd := setUpCommand()

	// run the command
	args := []string{fakeTaskID}
	// this should error out, if we don't have --force on a completed
	// task
	assert.Error(suite.T(), runRerun(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags()))
}

func (suite *FakeServerSuite) TestRunCompleteCommand() {
	// set up to run a command and capture output
	buf, cmd := setUpCommand()

	// run the command
	args := []string{fakeTaskID}
	assert.NoError(suite.T(), runComplete(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags()))

	suite.Equal("completed 'completed'\n", buf.String())
}

func TestParseEditDefinitionWithJSONFormat(t *testing.T) {
	edits, err := parseEditDefinition(`{"payload.image.taskId": "NEW_TASK_ID", "payload.env.DEBUG": "true"}`)
	assert.NoError(t, err)
	assert.Equal(t, "NEW_TASK_ID", edits["payload.image.taskId"])
	assert.Equal(t, "true", edits["payload.env.DEBUG"])
}

func TestSetNestedValue(t *testing.T) {
	data := make(map[string]any)
	err := setNestedValue(data, "payload.image.taskId", "NEW_TASK_ID")
	assert.NoError(t, err)

	payload := data["payload"].(map[string]any)
	image := payload["image"].(map[string]any)
	assert.Equal(t, "NEW_TASK_ID", image["taskId"])
}

func TestApplyEditsToTaskDefinition(t *testing.T) {
	taskDef := &tcqueue.TaskDefinitionRequest{
		Payload: json.RawMessage(`{"image": {"taskId": "OLD_TASK_ID"}}`),
	}

	edits := map[string]any{
		"payload.image.taskId": "NEW_TASK_ID",
	}

	err := applyEditsToTaskDefinition(taskDef, edits)
	assert.NoError(t, err)

	var payload map[string]any
	err = json.Unmarshal(taskDef.Payload, &payload)
	assert.NoError(t, err)

	image := payload["image"].(map[string]any)
	assert.Equal(t, "NEW_TASK_ID", image["taskId"])
}

func (suite *FakeServerSuite) TestRetriggerWithEditDefinition() {
	buf, cmd := setUpCommand()
	cmd.Flags().String("edit-definition", `{"payload.image.taskId": "NEW_TASK_ID"}`, "")

	args := []string{fakeTaskID}
	assert.NoError(suite.T(), runRetrigger(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags()))

	output := buf.String()
	assert.Contains(suite.T(), output, "Task")
	assert.Contains(suite.T(), output, "created")
}

func createTaskHandler(w http.ResponseWriter, _ *http.Request) {
	status := `{
		  "status": {
		    "taskId": "NEW_TASK_ID_123",
		    "state": "pending"
		  }
		}`
	_, _ = io.WriteString(w, status)
}
