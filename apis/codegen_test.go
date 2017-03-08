package apis

import (
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"strings"
	"testing"

	assert "github.com/stretchr/testify/require"
)

// TestCodeGeneration ensures that we generate the right code
// (i.e. matches the code in services_test.go) when calling a server
// It creates a thread that launches a server, then calls that server
func TestCodeGeneration(t *testing.T) {
	assert := assert.New(t)

	// launch server
	server := manifestServer()

	// query server, generate code
	source, err := GenerateServices("http://localhost:8080/manifest.json", "servicesTest", "schemasTest")
	assert.NoError(err, fmt.Sprintf("failed generating services: %s", err))

	// close server so our other tests using servers don't clash
	server.Close()

	// check that the returned byte thing is correct
	generated := strings.Trim(string(source), "\n\r\t ")
	desired, err := getDesiredOutput("services_test.go")

	assert.NoError(err, fmt.Sprintf("error getting desired output: %s", err))
	assert.Equal(generated, desired, "generated code doesn't match desired code")
}

// manifestServer sets up the server before launching it in a new thread
func manifestServer() *http.Server {
	handler := http.NewServeMux()
	handler.HandleFunc("/manifest.json", manifestHandler)
	handler.HandleFunc("/definition.json", apiDefHandler)

	server := &http.Server{
		Addr:    ":8080",
		Handler: handler,
	}

	go server.ListenAndServe()

	return server
}

// manifestHandler returns the test manifest on request
func manifestHandler(w http.ResponseWriter, _ *http.Request) {
	manifest := `{"Test": "http://localhost:8080/definition.json"}`
	io.WriteString(w, manifest)
}

// apiDefHandler returns the api definition on request
func apiDefHandler(w http.ResponseWriter, _ *http.Request) {
	definition := `{
  "version": 0,
  "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
  "title": "Test API",
  "description": "This is a Test service to test taskcluster-cli",
  "baseUrl": "http://localhost:8080",
  "entries": [
    {
      "type": "function",
      "method": "get",
      "route": "/test",
      "query": [],
      "args": [],
      "name": "test",
      "stability": "stable",
      "title": "Do a test",
      "description": "The server will match the request against a specific format to see if tc-cli works properly."
    }
  ]
}`
	io.WriteString(w, definition)
}

// TODO possibly test generation of schemas

// getDesiredOutput opens file `filename` and returns the trim of all of the file's
// contents that comes after `//###START###` so we can compare with what was generated
func getDesiredOutput(filename string) (string, error) {
	contents, err := ioutil.ReadFile(filename)
	if err != nil {
		return "", fmt.Errorf("unable to read %s, error: %s", filename, err)
	}

	match := strings.Split(string(contents), "//###START###\n")[1]
	match = strings.Trim(match, "\n\r\t ")

	return match, nil
}
