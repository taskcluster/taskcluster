package task

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/spf13/cobra"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-shell/config"
)

const fakeTaskID = "ANnmjMocTymeTID0tlNJAw"
const fakeRunID = "0"

type FakeServerSuite struct {
	suite.Suite
	testServer *httptest.Server
}

func (suite *FakeServerSuite) SetupSuite() {
	// set up a fake server that knows how to answer the `task()` method
	handler := http.NewServeMux()
	handler.HandleFunc("/api/queue/v1/task/"+fakeTaskID, taskHandler)
	handler.HandleFunc("/api/queue/v1/task/"+fakeTaskID+"/status", manifestHandler)
	handler.HandleFunc("/api/queue/v1/task/"+fakeTaskID+"/runs/"+fakeRunID+"/artifacts", artifactsHandler)
	handler.HandleFunc("/api/queue/v1/task/"+fakeTaskID+"/cancel", cancelHandler)
	handler.HandleFunc("/api/queue/v1/task/"+fakeTaskID+"/rerun", reRunHandler)
	handler.HandleFunc("/api/queue/v1/task/"+fakeTaskID+"/runs/"+fakeRunID+"/claim", claimTaskHandler)
	handler.HandleFunc("/api/queue/v1/task/"+fakeTaskID+"/runs/"+fakeRunID+"/completed", manifestHandler)

	suite.testServer = httptest.NewServer(handler)

	// set the base URL the subcommands use to point to the fake server
	config.SetRootURL(suite.testServer.URL)
}

func (suite *FakeServerSuite) TearDownSuite() {
	suite.testServer.Close()
	config.SetRootURL("")
}

func TestFakeServerSuite(t *testing.T) {
	suite.Run(t, new(FakeServerSuite))
}

// returns the test task on request
func taskHandler(w http.ResponseWriter, _ *http.Request) {
	metadata := `{"metadata": {"name": "my-test"}, "taskGroupId": "my-test"}`
	_, _ = io.WriteString(w, metadata)
}

// returns the test status on request
func manifestHandler(w http.ResponseWriter, _ *http.Request) {
	status := `{
				  "status": {
				    "state": "completed",
				    "runs": [
				      {
				        "runId": 0,
				        "state": "completed",
				        "reasonCreated": "scheduled",
				        "reasonResolved": "completed"
				      }
				    ]
				  }
				}`
	_, _ = io.WriteString(w, status)
}

func artifactsHandler(w http.ResponseWriter, _ *http.Request) {
	artifacts := `{
				  	"artifacts": [
				    {
				      	"storageType": "reference",
				      	"name": "fake_live.log",
				      	"expires": "2318-02-02T21:58:38.425Z",
				      	"contentType": "text/plain"
				    },
				    {
				      	"storageType": "s3",
				      	"name": "fake_live_backing.log",
				      	"expires": "2318-02-02T21:58:37.584Z",
				      	"contentType": "text/plain"
				    }
				  ]
				}`
	_, _ = io.WriteString(w, artifacts)
}

func setUpCommand() (*bytes.Buffer, *cobra.Command) {
	buf := &bytes.Buffer{}
	cmd := &cobra.Command{}
	cmd.SetOut(buf)
	cmd.SetErr(buf)

	return buf, cmd
}

func (suite *FakeServerSuite) TestNameCommand() {
	// set up to run a command and capture output
	buf, cmd := setUpCommand()

	// run the command
	args := []string{fakeTaskID}
	assert.NoError(suite.T(), runName(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags()))

	suite.Equal("my-test\n", buf.String())
}

func (suite *FakeServerSuite) TestDefCommand() {
	// set up to run a command and capture output
	buf, cmd := setUpCommand()

	// run the command
	args := []string{fakeTaskID}
	assert.NoError(suite.T(), runDef(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags()))

	var f any
	assert.NoError(suite.T(), json.Unmarshal(buf.Bytes(), &f))
	m := f.(map[string]any)
	m = m["metadata"].(map[string]any)
	suite.Equal("my-test", m["name"])
}

// TEST REMOVED -- depends on an artifact in a single deployment, which is now gone.
/*
// Test the `task log` subcommand against a real task, since it does its own
// HTTP handling
func TestLogCommand(t *testing.T) {
	assert := assert.New(t)

	buf, cmd := setUpCommand()

	args := []string{"YwxadSlPQm-d9jV8V0F9Ig"}
	runLog(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags())

	// This is the output of a static log
	s := `[taskcluster 2018-06-05 17:24:56.191Z] Task ID: YwxadSlPQm-d9jV8V0F9Ig
[taskcluster 2018-06-05 17:24:56.191Z] Worker ID: i-06fcf8c1cc7acdd70
[taskcluster 2018-06-05 17:24:56.191Z] Worker Group: us-west-2
[taskcluster 2018-06-05 17:24:56.191Z] Worker Node Type: m3.large
[taskcluster 2018-06-05 17:24:56.191Z] Worker Type: tutorial
[taskcluster 2018-06-05 17:24:56.191Z] Public IP: 18.236.208.30

5037c5cd623d - Started downloading
5037c5cd623d - Downloaded in 0.015 seconds
0d8710fc57fd - Started downloading
83b53423b49f - Started downloading
83b53423b49f - Downloaded in 0.001 seconds
0d8710fc57fd - Downloaded in 0.661 seconds
e9e8bd3b94ab - Started downloading
7db00e6b6e5e - Started downloading
7db00e6b6e5e - Downloaded in 0.044 seconds
e9e8bd3b94ab - Downloaded in 0.343 seconds
a3ed95caeb02 - Started downloading
a3ed95caeb02 - Downloaded in 0.001 seconds
Digest: sha256:403105e61e2d540187da20d837b6a6e92efc3eb4337da9c04c191fb5e28c44dc
Status: Downloaded newer image for ubuntu:13.10
[taskcluster 2018-06-05 17:25:06.493Z] === Task Starting ===
hello World
[taskcluster 2018-06-05 17:25:07.016Z] === Task Finished ===
[taskcluster 2018-06-05 17:25:07.016Z] Successful task run with exit code: 0 completed in 10.827 seconds
`
	assert.Equal(s, buf.String(), "Log's are not equal.")
}
*/

func (suite *FakeServerSuite) TestArtifactsCommand() {
	// set up to run a command and capture output
	buf, cmd := setUpCommand()

	// run the command
	args := []string{fakeTaskID}

	assert.NoError(suite.T(), runArtifacts(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags()))
	suite.Equal("fake_live.log\nfake_live_backing.log\n", buf.String())

}

func (suite *FakeServerSuite) TestGroupCommand() {
	// set up to run a command and capture output
	buf, cmd := setUpCommand()

	// run the command
	args := []string{fakeTaskID}
	assert.NoError(suite.T(), runGroup(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags()))

	suite.Equal("my-test\n", buf.String())
}

func (suite *FakeServerSuite) TestStatusCommand() {
	// set up to run a command and capture output
	buf, cmd := setUpCommand()

	args := []string{fakeTaskID}

	// Test run flag
	cmd.Flags().IntP("run", "r", 0, "Specifies which run to consider.")
	assert.NoError(suite.T(), runStatus(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags()))

	suite.Equal("completed 'completed'\n", buf.String())

	// Test all-runs flag
	buf.Reset()

	assert.NoError(suite.T(), cmd.Flags().Set("run", "-1"))
	cmd.Flags().BoolP("all-runs", "a", true, "Specifies which run to consider.")

	assert.NoError(suite.T(), runStatus(&tcclient.Credentials{}, args, cmd.OutOrStdout(), cmd.Flags()))

	suite.Equal("Run #0: completed 'completed'\n", buf.String())
}
