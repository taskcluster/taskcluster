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

/* DRAFT
	- Get definition from test server
	- Generate code from that definition
		- we probably can't go further here, so simply test that the generated code matches what we want
		- then use the correct code (the one we use to ensure correct code generation) to do next step
	- Generate command and functions from that code
	- Test that command and functions with another test server
*/

func TestCodeGeneration(t *testing.T) {
	assert := assert.New(t)

	// launch server
	manifestServer()

	// GenerateServices(url etc etc)
	source, err := GenerateServices("http://localhost:8080/manifest.json", "servicesTest", "schemasTest")
	assert.NoError(err, fmt.Sprintf("failed generating services: %s", err))

	// check that the returned byte thing is correct
	generated := strings.Trim(string(source), "\n\r\t ")
	desired, err := getDesiredOutput("services_test.go")

	//t.Log("generated is ", generated)
	//t.Log("desired is ", desired)

	assert.NoError(err, fmt.Sprintf("error getting desired output: %s", err))
	assert.Equal(generated, desired, "generated code doesn't match desired code")
}

func manifestServer() {
	handler := http.NewServeMux()
	handler.HandleFunc("/manifest.json", manifestHandler)
	handler.HandleFunc("/definition.json", apiDefHandler)

	server := &http.Server{
		Addr:		":8080",
		Handler:	handler,
	}

	go server.ListenAndServe()
	// will auto die when tests are done
}

func manifestHandler(w http.ResponseWriter, _ *http.Request) {
	manifest := `{"Test": "http://localhost:8080/definition.json"}`
	io.WriteString(w, manifest)
}

func apiDefHandler(w http.ResponseWriter, _ *http.Request) {
	definition := `{
  "version": 0,
  "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
  "title": "Test API",
  "description": "This is a Test service to test taskcluster-cli",
  "baseUrl": "http://localhost",
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

func getDesiredOutput(filename string) (string, error) {
	contents, err := ioutil.ReadFile(filename)
	if err != nil {
		return "", fmt.Errorf("unable to read %s, error: %s", filename, err)
	}

	match := strings.Split(string(contents), "//###START###\n")[1]
	match = strings.Trim(match, "\n\r\t ")

	return match, nil
}
