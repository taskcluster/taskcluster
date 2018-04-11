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
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcauth
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcawsprovisioner
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcec2manager
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcgithub
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tchooks
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcindex
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tclogin
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcnotify
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcpurgecache
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcqueue
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcsecrets

### AMQP APIs
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcauthevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcawsprovisionerevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcgithubevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcpurgecacheevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcqueueevents
* http://godoc.org/github.com/taskcluster/taskcluster-client-go/tctreeherderevents

## Example programs

To get you started quickly, I have also included some example programs that use both the http services and the amqp services:

* This [HTTP example program](http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcauth#example-package--Scopes) demonstrates the use of the [tcauth](http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcauth) package to query the expiry and expanded scopes of a given clientId.
* This [HTTP example program](http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcauth#example-package--UpdateClient) demonstrates the use of the [tcauth](http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcauth) package to update an existing clientId with a new description and expiry.
* The [AMQP example program](http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcqueueevents#example-package--TaskclusterSniffer) demonstrates the use of the [tcqueueevents](http://godoc.org/github.com/taskcluster/taskcluster-client-go/tcqueueevents) package to listen in on Task Cluster tasks being defined and executed.

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
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

// *********************************************************
// These type definitions are copied from:
// https://github.com/taskcluster/generic-worker/blob/ec86473df8dba68631a50af98e5af7d44d7e1717/generated_windows.go#L40-L201
// *********************************************************

type (
	// This schema defines the structure of the `payload` property referred to in a
	// Taskcluster Task definition.
	GenericWorkerPayload struct {

		// Artifacts to be published.
		//
		// Since: generic-worker 1.0.0
		Artifacts []struct {

			// Explicitly set the value of the HTTP `Content-Type` response header when the artifact(s)
			// is/are served over HTTP(S). If not provided (this property is optional) the worker will
			// guess the content type of artifacts based on the filename extension of the file storing
			// the artifact content. It does this by looking at the system filename-to-mimetype mappings
			// defined in the Windows registry. Note, setting `contentType` on a directory artifact will
			// apply the same contentType to all files contained in the directory.
			//
			// See [mime.TypeByExtension](https://godoc.org/mime#TypeByExtension).
			//
			// Since: generic-worker 10.4.0
			ContentType string `json:"contentType,omitempty"`

			// Date when artifact should expire must be in the future, no earlier than task deadline, but
			// no later than task expiry. If not set, defaults to task expiry.
			//
			// Since: generic-worker 1.0.0
			Expires tcclient.Time `json:"expires,omitempty"`

			// Name of the artifact, as it will be published. If not set, `path` will be used.
			// Conventionally (although not enforced) path elements are forward slash separated. Example:
			// `public/build/a/house`. Note, no scopes are required to read artifacts beginning `public/`.
			// Artifact names not beginning `public/` are scope-protected (caller requires scopes to
			// download the artifact). See the Queue documentation for more information.
			//
			// Since: generic-worker 8.1.0
			Name string `json:"name,omitempty"`

			// Relative path of the file/directory from the task directory. Note this is not an absolute
			// path as is typically used in docker-worker, since the absolute task directory name is not
			// known when the task is submitted. Example: `dist\regedit.exe`. It doesn't matter if
			// forward slashes or backslashes are used.
			//
			// Since: generic-worker 1.0.0
			Path string `json:"path"`

			// Artifacts can be either an individual `file` or a `directory` containing
			// potentially multiple files with recursively included subdirectories.
			//
			// Since: generic-worker 1.0.0
			//
			// Possible values:
			//   * "file"
			//   * "directory"
			Type string `json:"type"`
		} `json:"artifacts,omitempty"`

		// One entry per command (consider each entry to be interpreted as a full line of
		// a Windows™ .bat file). For example:
		// ```
		// [
		//   "set",
		//   "echo hello world > hello_world.txt",
		//   "set GOPATH=C:\\Go"
		// ]
		// ```
		//
		// Since: generic-worker 0.0.1
		Command []string `json:"command"`

		// Env vars must be string to __string__ mappings (not number or boolean). For example:
		// ```
		// {
		//   "PATH": "C:\\Windows\\system32;C:\\Windows",
		//   "GOOS": "windows",
		//   "FOO_ENABLE": "true",
		//   "BAR_TOTAL": "3"
		// }
		// ```
		//
		// Since: generic-worker 0.0.1
		Env map[string]string `json:"env,omitempty"`

		// Feature flags enable additional functionality.
		//
		// Since: generic-worker 5.3.0
		Features struct {

			// An artifact named `public/chainOfTrust.json.asc` should be generated
			// which will include information for downstream tasks to build a level
			// of trust for the artifacts produced by the task and the environment
			// it ran in.
			//
			// Since: generic-worker 5.3.0
			ChainOfTrust bool `json:"chainOfTrust,omitempty"`

			// The taskcluster proxy provides an easy and safe way to make authenticated
			// taskcluster requests within the scope(s) of a particular task. See
			// [the github project](https://github.com/taskcluster/taskcluster-proxy) for more information.
			//
			// Since: generic-worker 10.6.0
			TaskclusterProxy bool `json:"taskclusterProxy,omitempty"`
		} `json:"features,omitempty"`

		// Maximum time the task container can run in seconds.
		//
		// Since: generic-worker 0.0.1
		//
		// Mininum:    1
		// Maximum:    86400
		MaxRunTime int64 `json:"maxRunTime"`

		// Directories and/or files to be mounted.
		//
		// Since: generic-worker 5.4.0
		Mounts []Mount `json:"mounts,omitempty"`

		// A list of OS Groups that the task user should be a member of. Requires
		// scope `generic-worker:os-group:<os-group>` for each group listed.
		//
		// Since: generic-worker 6.0.0
		OSGroups []string `json:"osGroups,omitempty"`

		// Specifies an artifact name for publishing RDP connection information.
		//
		// Since this is potentially sensitive data, care should be taken to publish
		// to a suitably locked down path, such as
		// `login-identity/<login-identity>/rdpinfo.json` which is only readable for
		// the given login identity (for example
		// `login-identity/mozilla-ldap/pmoore@mozilla.com/rdpInfo.txt`). See the
		// [artifact namespace guide](https://docs.taskcluster.net/manual/design/namespaces#artifacts) for more information.
		//
		// Use of this feature requires scope
		// `generic-worker:allow-rdp:<provisionerId>/<workerType>` which must be
		// declared as a task scope.
		//
		// The RDP connection data is published during task startup so that a user
		// may interact with the running task.
		//
		// The task environment will be retained for 12 hours after the task
		// completes, to enable an interactive user to perform investigative tasks.
		// After these 12 hours, the worker will delete the task's Windows user
		// account, and then continue with other tasks.
		//
		// No guarantees are given about the resolution status of the interactive
		// task, since the task is inherently non-reproducible and no automation
		// should rely on this value.
		//
		// Since: generic-worker 10.5.0
		RdpInfo string `json:"rdpInfo,omitempty"`

		// URL of a service that can indicate tasks superseding this one; the current `taskId`
		// will be appended as a query argument `taskId`. The service should return an object with
		// a `supersedes` key containing a list of `taskId`s, including the supplied `taskId`. The
		// tasks should be ordered such that each task supersedes all tasks appearing later in the
		// list.
		//
		// See [superseding](https://docs.taskcluster.net/reference/platform/taskcluster-queue/docs/superseding) for more detail.
		//
		// Since: generic-worker 10.2.2
		SupersederURL string `json:"supersederUrl,omitempty"`
	}

	Mount json.RawMessage
)

func fatalOnError(err error) {
	if err != nil {
		log.Fatalf("Error:\n%v", err)
	}
}

func mustCompileToRawMessage(data interface{}) *json.RawMessage {
	bytes, err := json.Marshal(data)
	fatalOnError(err)
	var JSON json.RawMessage
	err = json.Unmarshal(bytes, &JSON)
	fatalOnError(err)
	return &JSON
}

func main() {
	myQueue, err := tcqueue.New(nil)
	fatalOnError(err)
	taskID := slugid.Nice()
	created := time.Now()

	env := map[string]string{}
	envJSON := mustCompileToRawMessage(env)

	payload := GenericWorkerPayload{
		Artifacts: []struct {
			Expires tcclient.Time "json:\"expires,omitempty\""
			Name    string        "json:\"name,omitempty\""
			Path    string        "json:\"path\""
			Type    string        "json:\"type\""
		}{},
		Command: []string{
			`echo Hello World!`,
		},
		Env: *envJSON,
		Features: struct {
			ChainOfTrust bool `json:"chainOfTrust,omitempty"`
		}{
			ChainOfTrust: false,
		},
		MaxRunTime: 60,
		Mounts:     []Mount{},
		OSGroups:   []string{},
	}

	payloadJSON := mustCompileToRawMessage(payload)

	taskDef := &tcqueue.TaskDefinitionRequest{
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
		Payload:       *payloadJSON,
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
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
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
	queueClient, err := tcqueue.New(tempCreds)
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
