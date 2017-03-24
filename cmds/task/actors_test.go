package task

import (
	"bytes"
	"io"
	"net/http"

	"github.com/spf13/cobra"
	tcclient "github.com/taskcluster/taskcluster-client-go"
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
	io.WriteString(w, status)
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
	io.WriteString(w, status)
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
	io.WriteString(w, status)
}

func (suite *FakeServerSuite) TestRunCancelCommand() {
	// set up to run a command and capture output
	buf := &bytes.Buffer{}
	cmd := &cobra.Command{}
	cmd.SetOutput(buf)

	// run the command
	args := []string{fakeTaskID}
	runCancel(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags())

	suite.Equal(string(buf.Bytes()), "cancelled 'cancelled'\n")
}

func (suite *FakeServerSuite) TestRunRerunCommand() {
	// set up to run a command and capture output
	buf := &bytes.Buffer{}
	cmd := &cobra.Command{}
	cmd.SetOutput(buf)

	// run the command
	args := []string{fakeTaskID}
	runRerun(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags())

	suite.Equal(string(buf.Bytes()), "running 'running'\n")
}

func (suite *FakeServerSuite) TestRunCompleteCommand() {
	// set up to run a command and capture output
	buf := &bytes.Buffer{}
	cmd := &cobra.Command{}
	cmd.SetOutput(buf)

	// run the command
	args := []string{fakeTaskID}
	runComplete(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags())

	suite.Equal(string(buf.Bytes()), "completed 'completed'\n")
}
