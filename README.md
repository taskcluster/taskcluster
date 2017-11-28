# taskcluster-client-go

[![logo](https://tools.taskcluster.net/b2d854df0391f8b777f39a486ebbc868.png)](https://tools.taskcluster.net/b2d854df0391f8b777f39a486ebbc868.png)

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-client-go.svg?branch=master)](http://travis-ci.org/taskcluster/taskcluster-client-go)
[![GoDoc](https://godoc.org/github.com/taskcluster/taskcluster-client-go?status.svg)](https://godoc.org/github.com/taskcluster/taskcluster-client-go)
[![Coverage Status](https://coveralls.io/repos/taskcluster/taskcluster-client-go/badge.svg?branch=master&service=github)](https://coveralls.io/github/taskcluster/taskcluster-client-go?branch=master)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

A go (golang) port of taskcluster-client.

Complete godoc documentation [here](https://godoc.org/github.com/taskcluster/taskcluster-client-go).

This library provides the following packages to interface with Taskcluster:

### HTTP APIs
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/auth
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/awsprovisioner
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/github
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/hooks
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/index
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/login
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/notify
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/purgecache
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/queue
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/secrets

### AMQP APIs
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/authevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/awsprovisionerevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/githubevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/purgecacheevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/queueevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/treeherderevents

## Example programs

To get you started quickly, I have also included some example programs that use both the http services and the amqp services:

* This [HTTP example program](http://godoc.org/github.com/taskcluster/taskcluster-client-go/auth#example-package--Scopes) demonstrates the use of the [auth](http://godoc.org/github.com/taskcluster/taskcluster-client-go/auth) package to query the expiry and expanded scopes of a given clientId.
* This [HTTP example program](http://godoc.org/github.com/taskcluster/taskcluster-client-go/auth#example-package--UpdateClient) demonstrates the use of the [auth](http://godoc.org/github.com/taskcluster/taskcluster-client-go/auth) package to update an existing clientId with a new description and expiry.
* The [AMQP example program](http://godoc.org/github.com/taskcluster/taskcluster-client-go/queueevents#example-package--TaskclusterSniffer) demonstrates the use of the [queueevents](http://godoc.org/github.com/taskcluster/taskcluster-client-go/queueevents) package to listen in on Task Cluster tasks being defined and executed.

## Calling API End-Points

To invoke an API end-point, instantiate one of the HTTP API classes (from
section [HTTP APIs](#http-apis)).  In the following example we instantiate an
instance of the `Queue` client class and use it to create a task.

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

type (

	// This schema defines the structure of the `payload` property referred to in a
	// TaskCluster Task definition.
	GenericWorkerPayload struct {

		// Artifacts to be published. For example:
		// `{ "type": "file", "path": "builds\\firefox.exe", "expires": "2015-08-19T17:30:00.000Z" }`
		Artifacts []struct {

			// Date when artifact should expire must be in the future
			Expires tcclient.Time `json:"expires"`

			// Filesystem path of artifact
			Path string `json:"path"`

			// Artifacts can be either an individual `file` or a `directory` containing
			// potentially multiple files with recursively included subdirectories.
			//
			// Possible values:
			//   * "file"
			//   * "directory"
			Type string `json:"type"`
		} `json:"artifacts,omitempty"`

		// One entry per command (consider each entry to be interpreted as a full line of
		// a Windows™ .bat file). For example:
		// `["set", "echo hello world > hello_world.txt", "set GOPATH=C:\\Go"]`.
		Command []string `json:"command"`

		// Example: ```{ "PATH": "C:\\Windows\\system32;C:\\Windows", "GOOS": "darwin" }```
		Env map[string]string `json:"env"`

		// Feature flags enable additional functionality.
		Features struct {

			// An artifact named chainOfTrust.json.asc should be generated
			// which will include information for downstream tasks to build
			// a level of trust for the artifacts produced by the task and
			// the environment it ran in.
			ChainOfTrust bool `json:"chainOfTrust,omitempty"`
		} `json:"features,omitempty"`

		// Maximum time the task container can run in seconds
		//
		// Mininum:    1
		// Maximum:    86400
		MaxRunTime int `json:"maxRunTime"`

		// Directories and/or files to be mounted
		Mounts []Mount `json:"mounts,omitempty"`

		// A list of OS Groups that the task user should be a member of. Requires
		// scope `generic-worker:os-group:<os-group>` for each group listed.
		OSGroups []string `json:"osGroups,omitempty"`
	}

	Mount json.RawMessage
)

func fatalOnError(err error) {
	if err != nil {
		log.Fatalf("Error:\n%v", err)
	}
}

func main() {
	myQueue, err := queue.New(nil)
	fatalOnError(err)
	taskID := slugid.Nice()
	created := time.Now()

	env := map[string]string{}

	payload := GenericWorkerPayload{
		Artifacts: []struct {
			Expires tcclient.Time `json:"expires"`
			Path    string        `json:"path"`
			Type    string        `json:"type"`
		}{},
		Command: []string{
			`echo Hello World!`,
		},
		Env: env,
		Features: struct {
			ChainOfTrust bool `json:"chainOfTrust,omitempty"`
		}{
			ChainOfTrust: false,
		},
		MaxRunTime: 60,
		Mounts:     []Mount{},
		OSGroups:   []string{},
	}

	payloadBytes, err := json.Marshal(payload)
	fatalOnError(err)
	var payloadJSON json.RawMessage
	err = json.Unmarshal(payloadBytes, &payloadJSON)
	fatalOnError(err)

	taskDef := &queue.TaskDefinitionRequest{
		Created:      tcclient.Time(created),
		Deadline:     tcclient.Time(created.Add(time.Hour * 3)),
		Dependencies: []string{},
		Expires:      tcclient.Time(created.Add(time.Hour * 24)),
		Extra:        json.RawMessage("{}"),
		Metadata: struct {
			Description string `json:"description"`
			Name        string `json:"name"`
			Owner       string `json:"owner"`
			Source      string `json:"source"`
		}{
			Description: "xxxx",
			Name:        "xxxx",
			Owner:       "pmoore@mozilla.com",
			Source:      "https://hg.mozilla.org/try/file/xxxx",
		},
		Payload:       payloadJSON,
		Priority:      "normal",
		ProvisionerID: "aws-provisioner-v1",
		Requires:      "all-completed",
		Retries:       5,
		Routes:        []string{},
		SchedulerID:   "-",
		Scopes:        []string{},
		Tags:          json.RawMessage("{}"),
		TaskGroupID:   taskID,
		WorkerType:    "win2012r2",
	}

	tsr, err := myQueue.CreateTask(taskID, taskDef)
	fatalOnError(err)

	respJSON, err := json.MarshalIndent(tsr, "", "  ")
	fatalOnError(err)

	fmt.Println(string(respJSON))
	fmt.Println("")
	fmt.Printf("curl -L https://queue.taskcluster.net/v1/task/%v/runs/0/artifacts/public/logs/live.log | gunzip\n", taskID)
}
```

## Temporary credentials

You can generate temporary credentials from permanent credentials using the
go client. This may be useful if you wish to issue credentials to a third
party. See https://docs.taskcluster.net/manual/apis/temporary-credentials for
more information. Both named and unnamed temporary credentials are supported,
although named credentials are preferred if you are not sure which type to use.

### Example

```go
package main

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

const (
	taskID = "VESwp9JaRo-XkFN_bemBhw"
	runID  = 0
)

// This simple demo lists the artifacts in run 0 of task
// VESwp9JaRo-XkFN_bemBhw. It creates permanent credentials from environment
// variables TASKCLUSTER_CLIENT_ID and TASKCLUSTER_ACCESS_TOKEN, and then
// creates temporary credentials, valid for 24 hours, from these permanent
// credentials. It queries the Queue using the temporary credentials, and with
// limited authorized scopes.
//
// Note, the queueClient.ListArtifacts(...) call doesn't require any scopes.
// The generation of temporary credentials, and limiting via authorized scopes
// is purely illustrative. The TASKCLUSTER_CLIENT_ID must satisfy
// auth:create-client:demo-client/taskcluster-client-go, though.
func main() {
	permCreds := &tcclient.Credentials{
		ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
	}
	tempCreds, err := permCreds.CreateNamedTemporaryCredentials(
		"demo-client/taskcluster-client-go",
		time.Hour*24,
		"assume:legacy-permacred",
	)
	if err != nil {
		log.Fatalf("Could not create temporary credentials: %v", err)
	}
	tempCreds.AuthorizedScopes = []string{
		"queue:get-artifact:private/build/*",
	}
	queueClient, err := queue.New(tempCreds)
	if err != nil {
		// bug in code
		log.Fatalf("SERIOUS BUG! Could not create client from generated temporary credentials: %v", err)
	}
	listArtifactsResponse, err := queueClient.ListArtifacts(taskID, strconv.Itoa(runID), "", "")
	if err != nil {
		log.Fatalf("Could not call queue.listArtifacts endpoint: %v", err)
	}
	fmt.Printf("Task %v run %v artifacts:\n", taskID, runID)
	for _, artifact := range listArtifactsResponse.Artifacts {
		fmt.Printf("  * %v\n", artifact.Name)
	}
	fmt.Println("Done")
}
```

See the [HTTP API godocs](#http-apis) for more information, or browse the [integration
tests](https://github.com/taskcluster/taskcluster-client-go/tree/master/integrationtest)
for further examples.

## Building
The libraries provided by this client are auto-generated based on the schemas listed under
http://references.taskcluster.net/manifest.json combined with the supplementary information stored in
[apis.json](https://github.com/taskcluster/taskcluster-client-go/blob/master/codegenerator/model/apis.json).

In order to completely regenerate all of the HTTP and AMQP libraries, please run [build.sh](https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh)
found in the top level directory. This will completely regenerate the library. Please note you will need an active internet connection as the build process must
download several json files and schemas in order to build the library.

The code which generates the library can all be found under the top level [codegenerator](https://github.com/taskcluster/taskcluster-client-go/tree/master/codegenerator)
directory.

## Contributing
Contributions are welcome. Please fork, and issue a Pull Request back with an explanation of your changes.

## Travis
Travis build [success/failure messages](http://travis-ci.org/taskcluster/taskcluster-client-go) are posted to irc channel #taskcluster-bots on irc.mozilla.org:6697.
