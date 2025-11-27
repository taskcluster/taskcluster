package task

import (
	"io"
	"net/http"

	"github.com/stretchr/testify/assert"
	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
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
