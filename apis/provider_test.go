package apis

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	assert "github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster-cli/apis/definitions"
	"github.com/taskcluster/taskcluster-cli/config"
)

var providerServer *httptest.Server

// TestCommandGeneration checks that we generate a valid command from a definition
// it uses a test server to see that the command makes the right request to the backend
func TestCommandGeneration(t *testing.T) {
	assert := assert.New(t)

	// start test server
	providerServer := apiServer()
	defer providerServer.Close()

	// make command/subcommand from definition
	// we're not actually using the URL/port in the def, we get one from httptest
	// apparently you have to write these 3 things below instead of just one...
	def := servicesTest["Test"]
	def.BaseURL = providerServer.URL
	servicesTest["Test"] = def

	cmd := makeCmdFromDefinition("Test", servicesTest["Test"])

	// set payload through stdin, if necessary

	// find subcommand, set its output
	subCmd, _, err := cmd.Find([]string{"test", "test"})
	assert.NoError(err, fmt.Sprintf("could not find subcommand, error: %s", err))

	buf := &bytes.Buffer{}
	subCmd.SetOutput(buf)

	// load config, we need this for baseURL
	config.Setup()

	// execute command, server will receive request
	cmd.SetArgs([]string{"test", "test"})
	err = cmd.Execute()
	assert.NoError(err, fmt.Sprintf("error executing command: %s", err))

	// the server will reply 'true' if the request is what was expected
	// currently the server always replies true when getting a request, any request
	expected := "true"
	actual := buf.String()
	assert.Equal(expected, actual, "request sent to test server was invalid, replied: %s", actual)
}

// the code from which we generate the test command
var servicesTest = map[string]definitions.Service{
	"Test": definitions.Service{
		BaseURL:     "http://localhost:8080", // will be modified before call for httptest purposes
		Title:       "Test API",
		Description: "This is a Test service to test taskcluster-cli",
		Entries: []definitions.Entry{
			definitions.Entry{
				Type:        "function",
				Name:        "test",
				Title:       "Do a test",
				Description: "The server will match the request against a specific format to see if tc-cli works properly.",
				Scopes:      [][]string(nil),
				Stability:   "stable",
				Method:      "get",
				Route:       "/test",
				Args:        []string{},
				Query:       []string{},
				Input:       "",
				Output:      "",
			},
		},
	},
}
var schemasTest = map[string]string{}

// apiServer sets up the server and launches it in a new thread
func apiServer() *httptest.Server {
	handler := http.NewServeMux()
	handler.HandleFunc("/test", apiHandler)

	return httptest.NewServer(handler)
}

// apiHandler checks that the received request is valid, and replies
func apiHandler(w http.ResponseWriter, _ *http.Request) {
	// currently, we only check whether we receive a request or not, so we simply reply true
	io.WriteString(w, "true")
	// when we add more tests, we might want to verify the request we received was right
	// in this case, we might want to reply with more elaborated answers
}
