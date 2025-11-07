package apis

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	assert "github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v93/clients/client-shell/apis/definitions"
	"github.com/taskcluster/taskcluster/v93/clients/client-shell/config"
)

// TestCommandGeneration checks that we generate a valid command from a definition
// it uses a test server to see that the command makes the right request to the backend
func TestCommandGeneration(t *testing.T) {
	assert := assert.New(t)

	// start test server
	providerServer := apiServer()
	config.SetRootURL(providerServer.URL)
	defer providerServer.Close()

	// make command/subcommand from definition
	// we're not actually using the URL/port in the def, we get one from httptest
	// apparently you have to write these 3 things below instead of just one...
	def := servicesTest["Test"]
	servicesTest["Test"] = def

	cmd := makeCmdFromDefinition("Test", servicesTest["Test"])

	// set payload through stdin, if necessary

	// find subcommand, set its output
	subCmd, _, err := cmd.Find([]string{"test", "test"})
	assert.NoError(err, "could not find subcommand, error: %s", err)

	buf := &bytes.Buffer{}
	subCmd.SetOut(buf)
	subCmd.SetErr(buf)

	// execute command, server will receive request
	cmd.SetArgs([]string{"test", "test"})
	err = cmd.Execute()
	assert.NoError(err, fmt.Sprintf("error executing command: %s", err))

	// the server will reply 'true' if the request is what was expected
	// The provider should not be adding the "key" query parameter as we did not
	// provide a value for it.
	expected := "true"
	actual := buf.String()
	assert.Equal(expected, actual, "request sent to test server was invalid, replied: %s", actual)

	// Here we test that the "key" query parameter is indeed added to the API call
	// by getting the API to play back the value it received
	val := "AKJSD@5$Tshdasdau09ih293ubdks"
	cmd.SetArgs([]string{"test", "test", "--key", val})
	buf.Reset()
	err = cmd.Execute()
	assert.NoError(err, "error executing command: %s", err)
	actual = buf.String()
	assert.Equal(val, actual, "request sent to test server was invalid, replied: %s", actual)
}

// the code from which we generate the test command
var servicesTest = map[string]definitions.Service{
	"Test": definitions.Service{
		ServiceName: "test",
		APIVersion:  "v1",
		Title:       "Test API",
		Description: "This is a Test service to test taskcluster-cli",
		Entries: []definitions.Entry{
			definitions.Entry{
				Name:        "test",
				Title:       "Do a test",
				Description: "The server will match the request against a specific format to see if tc-cli works properly.",
				Stability:   "stable",
				Method:      "get",
				Route:       "/test",
				Args:        []string{},
				Query:       []string{"key"},
				Input:       "",
			},
		},
	},
}

func TestRedirectIsNotError(t *testing.T) {
	// start test server
	providerServer := apiServer()
	config.SetRootURL(providerServer.URL)
	defer providerServer.Close()

	// entry for the redirect endpoint
	entry := definitions.Entry{
		Name:        "redirect",
		Title:       "Do a redirect",
		Description: "returns a redirect",
		Stability:   "stable",
		Method:      "get",
		Route:       "/redirect",
		Args:        []string{},
		Query:       []string{},
		Input:       "",
	}

	output := bytes.NewBuffer([]byte{})

	err := execute("test", "v1", &entry, nil, nil, nil, output)

	// this should not be an error, instead showing the JSON response
	assert.NoError(t, err)
	assert.Equal(t, output.String(), "{\"url\":\"http://nosuch.example.com\"}")
}

func TestErrorHandling(t *testing.T) {
	// start test server
	providerServer := apiServer()
	config.SetRootURL(providerServer.URL)
	defer providerServer.Close()

	// entry for the redirect endpoing
	entry := definitions.Entry{
		Name:        "error",
		Title:       "Error",
		Description: "returns an error",
		Stability:   "stable",
		Method:      "get",
		Route:       "/err",
		Args:        []string{},
		Query:       []string{},
		Input:       "",
	}

	err := execute("test", "v1", &entry, nil, nil, nil, nil)

	// this should be an error and include the message
	assert.Error(t, err)
	assert.Equal(t, err.Error(), "API Error 409: ResourceConflict\nI'm sorry dave..\nI can't let you do that.")
}

// apiServer sets up the server and launches it in a new thread
func apiServer() *httptest.Server {
	handler := http.NewServeMux()
	handler.HandleFunc("/api/test/v1/test", apiHandler)
	handler.HandleFunc("/api/test/v1/redirect", redirHandler)
	handler.HandleFunc("/api/test/v1/err", errorHandler)

	return httptest.NewServer(handler)
}

// apiHandler checks that the received request is valid, and replies
func apiHandler(w http.ResponseWriter, r *http.Request) {
	// If the "key" parameter is not present, we simply return "true"
	// However, if the "key" parameter is present, we echo back the value given.
	query := r.URL.Query()

	if _, ok := query["key"]; ok {
		_, _ = io.WriteString(w, query.Get("key"))
	} else {
		_, _ = io.WriteString(w, "true")
	}
}

// redirHandler returns a redirect, which should be treated as an error
func redirHandler(w http.ResponseWriter, r *http.Request) {
	w.Header()["Location"] = []string{"http://nosuch.example.com"}
	w.WriteHeader(303)
	fmt.Fprintf(w, "{\"url\":\"http://nosuch.example.com\"}")
}

// errorHandler returns an error, in the Taskcluster format
func errorHandler(w http.ResponseWriter, r *http.Request) {
	w.Header()["Content-Type"] = []string{"application/json"}
	w.WriteHeader(409)
	body := map[string]any{
		"code":    "ResourceConflict",
		"message": "I'm sorry dave..\nI can't let you do that.",
	}
	bodystr, _ := json.Marshal(body)
	_, err := w.Write(bodystr)
	if err != nil {
		panic(err)
	}
}
