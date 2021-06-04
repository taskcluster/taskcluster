package validatejson

import (
	"io/ioutil"
	"os"
	"testing"

	"github.com/spf13/cobra"
	_ "github.com/spf13/pflag"
	"github.com/stretchr/testify/assert"
)

type validateTest struct {
	Description string
	// Some tests may not always pass, so some tests are manually edited to include
	// an extra attribute whether that specific test should be disabled and skipped
	Schema string
	Tests  []validateTestCase
}

type validateTestCase struct {
	Data  []byte
	Valid bool
}

func TestValidateDockerJson(t *testing.T) {
	// setup a directory in /tmp
	tmpDir, err := ioutil.TempDir("", "validate_json")
	if err != nil {
		log.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	assert := assert.New(t)

	for _, test := range allTests {
		schema := test.Schema
		for _, testCase := range test.Tests {
			// create a temp file to dump json data
			file, err := ioutil.TempFile(tmpDir, "test*.json")
			if err != nil {
				log.Fatal(err)
			}
			defer file.Close()
			err = ioutil.WriteFile(file.Name(), testCase.Data, os.ModePerm)
			if err != nil {
				log.Fatal(err)
			}

			err = validate(&cobra.Command{}, []string{schema, file.Name()})
			if testCase.Valid {
				assert.NoError(err)
			} else {
				assert.Error(err, "The document is not valid")
			}
		}
	}
}

var allTests = []validateTest{
	{
		Description: "docker-worker payload validation tests",
		Schema:      "https://community-tc.services.mozilla.com/schemas/docker-worker/v1/payload.json",
		Tests: []validateTestCase{
			{
				Valid: true,
				Data: []byte(`{
				  "image": "dolore cillum eu",
				  "maxRunTime": 240064,
				  "capabilities": {
					"devices": {
					  "kvm": false,
					  "loopbackAudio": false,
					  "loopbackVideo": true,
					  "hostSharedMemory": true
					}
				  },
				  "command": [
					"reprehenderit ullamco Ut"
				  ]
				}`),
			},
			{
				Valid: false,
				Data: []byte(`{
				  "maxRunTime": 240064,
				  "capabilities": {
					"devices": {
					  "kvm": false,
					  "loopbackAudio": false,
					  "loopbackVideo": true,
					  "hostSharedMemory": true
					}
				  },
				  "command": [
					"reprehenderit ullamco Ut"
				  ]
				}`),
			},
		},
	},
	{
		Description: "create-task-request schema validation",
		Schema:      "https://community-tc.services.mozilla.com/schemas/queue/v1/create-task-request.json",
		Tests: []validateTestCase{
			{
				Valid: true,
				Data: []byte(`{
					"created": "2021-01-01T20:20:39+00:00",
					"metadata": {
						"description": "this task does something",
						"name": "some task",
						"owner": "taskcluster-team",
						"source": "https://github.com"
					},
					"deadline": "2021-01-01T20:20:39+00:00",
					"payload": {
						"loren": "ipsum"
					}
				}`),
			},
			{
				Valid: false,
				Data: []byte(`{
					"created": "2021-01-01T20:20:39+00:00",
					"metadata": {
						"description": "this task does something",
						"name": "some task",
						"owner": "taskcluster-team",
						"source": "non-uri-format"
					},
					"deadline": "2021-01-01T20:20:39+00:00",
					"payload": {
						"loren": "ipsum"
					}
				}`),
			},
		},
	},
	{
		Description: "GitHub push message schema validation",
		Schema:      "https://community-tc.services.mozilla.com/references/schemas/github/v1/github-push-message.json",
		Tests: []validateTestCase{
			{
				Valid: true,
				Data: []byte(`{
					"version": 1,
					"organization": "S",
					"repository": "pb4IRsWnp9",
					"installationId": 325353,
					"eventId": "lvsRvD6v-OJWA-Lwjd-CjUw-Fun8WWgeZRbP",
					"body": {
					  "laboris22f": false
					},
					"tasks_for": "fugiat aliqua eiusmod commodo",
					"branch": "dolore",
					"details": {
					  "commodo_9_": false
					}
				}`),
			},
			{
				Valid: false,
				Data: []byte(`{
					"version": 1,
					"organization": "S",
					"repository": "pb4IRsWnp9",
					"installationId": 325353,
					"eventId": "lvsRvD6vOJWALwjdCjUwFun8WWgeZRbP",
					"body": {
					  "laborumf": 81493011
					},
					"tasks_for": "fugiat aliqua eiusmod commodo",
					"branch": "dolore",
					"details": {
					  "commodo_9_": false
					}
				}`),
			},
		},
	},
}
