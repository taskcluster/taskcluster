# Taskcluster Client for Go


[![GoDoc](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go?status.svg)](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

**A Taskcluster client library for Go.**

This package contains a complete client interface to Taskcluster in Go,
including pre-defined types for the data structures consumed and produced by
the API methods.

## Usage

For a general guide to using Taskcluster clients, see [Calling Taskcluster APIs](https://docs.taskcluster.net/docs/manual/using/api).

This library provides the following packages to interface with Taskcluster:

### HTTP APIs

<!--HTTP-API-start-->
* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcauth

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcgithub

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tchooks

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcindex

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcnotify

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcobject

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcpurgecache

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcsecrets

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcworkermanager
 <!--HTTP-API-end-->

### AMQP APIs

<!--AMQP-API-start-->
* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcauthevents

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcgithubevents

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tchooksevents

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcnotifyevents

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueueevents

* https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcworkermanagerevents
 <!--AMQP-API-end-->

### Setup

Before invoking API methods, create a client object corresponding to the service you wish to communicate with.
See the [client subdirectories](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go#pkg-subdirectories) for the list of available packages, each beginning with `tc`.

The most common case is to use `NewFromEnv`, reading environment variables for credentials:

```go
import (
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"

	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
)
queue := tcqueue.NewFromEnv()
```

Each client package has a `New` method that takes explicit configuration, too:

```go
creds := tcclient.Credentials{
    ClientID: "..",
    AccessToken: "..",
}
queue := tcqueue.New(&creds, rootURL)
```
If the first argument is `nil`, then the client makes API requests without authentication.

The `Credentials` struct has an optional list of `AuthorizedScopes`.  This can
be used to [restrict the scopes for a
request](https://docs.taskcluster.net/docs/manual/design/apis/hawk/authorized-scopes),

### Calling API Methods

Each client object exposes API methods by their Golang-formatted name.
For example, a `tcqueue.Queue` object has methods like `CreateTask` and `GetArtifact`.
The calling signature for these methods resemble those in the service reference documentation, with the payload and response data represented by Golang structs.

For example, the `CreateTask` method is called like this:

```go
import (
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"
    "github.com/taskcluster/slugid-go"
)
task := tcqueue.TaskDefinitionRequest{..};
taskId: = slugid.Nice()
status := queue.CreateTask(taskId, &task)
```

Complete Godoc documentation of the available methods and types is [here](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go); see the "Directories" section to find the interfaces defined for specific services.

### Specifying exponential backoff settings for HTTP request retries

By default, the API methods will retry HTTP requests using an exponential
backoff algorithm, for failures that are considered potentially intermittent
(such as 5xx HTTP status codes).

In order to adjust the default retry exponential backoff settings, you can do
something like this:

```go
import (
	"github.com/cenkalti/backoff/v3"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"
)
queue := tcqueue.NewFromEnv()
settings := &backoff.ExponentialBackOff{
	InitialInterval:     5 * time.Millisecond,
	RandomizationFactor: 0,
	Multiplier:          100,
	MaxInterval:         60 * time.Second,
	MaxElapsedTime:      100 * time.Millisecond,
	Clock:               backoff.SystemClock,
}
settings.Reset()
queue.HTTPBackoffClient = &httpbackoff.Client{
    BackOffSettings: settings,
}
```


### Generating Signed URLs

API methods which take credentials and have method GET can be invoked with a signed URL.
To generate such a URL, use the method with suffix `_SignedURL`, and pass as its final argument the duration for which the URL should be valid.
For example, to generate a URL for [Queue.GetArtifact](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue#Queue.GetArtifact_SignedURL):

```go
url := queue.GetArtifact_SignedURL(taskId, runId, "my/secret/artifact.txt", 5 * time.Minutes)
```

### Generating Temporary Credentials

You can generate temporary credentials from permanent credentials using the
Go client. This may be useful if you wish to issue credentials to a third
party. See [the manual](https://docs.taskcluster.net/docs/manual/design/env-vars) for
more information.

Create named credentials with
[`Credentials.CreateNamedTemporaryCredentials`](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go#Credentials.CreateNamedTemporaryCredentials),
or unnamed credentials with
[`Credentials.CreateTemporaryCredentials`](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go#Credentials.CreateTemporaryCredentials).
Named credentials are preferred if you are not sure which type to use.

#### Example

```go
package main

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"
)

const (
	taskID  = "VESwp9JaRo-XkFN_bemBhw"
	runID   = 0
    rootURL = "https://tc.example.com"
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
// auth:create-client:demo-client/taskcluster/clients/client-go, though.
func main() {
	permCreds := &tcclient.Credentials{
		ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
	}
	tempCreds, err := permCreds.CreateNamedTemporaryCredentials(
		"demo-client/taskcluster/clients/client-go",
		time.Hour*24,
		"assume:legacy-permacred",
	)
	if err != nil {
		log.Fatalf("Could not create temporary credentials: %v", err)
	}
	tempCreds.AuthorizedScopes = []string{
		"queue:get-artifact:private/build/*",
	}
	queueClient, err := tcqueue.New(tempCreds, rootURL)
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
### Handling Timestamps

Taskcluster uses RFC3339 timestamps, specifically with millisecond precision and a `Z` timestamp.
To support serializing and deserializing this format exactly, use the [`tcclient.Time`](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go#Time) type instead of with the built-in `time.Time` type.

All timestamp arithmetic should be performed with the built-in `time` package.

### Generating SlugIDs

To generate SlugIDs, such as for TaskIDs, use [github.com/taskcluster/slugid-go](https://github.com/taskcluster/slugid-go).

### Uploading and Downloading Objects

The Object Service provides APIs for reliable uploads and downloads of large
objects (files). As with all taskcluster services, the tcobject package
provides direct access to the underlying APIs, but in addition, also provides
higher-level convenience methods that can be used to negotiate data transfers
without the caller needing to be concerned with the underlying mechanics of the
client/server communication.

Whether you choose to use the convenience methods, or call the underlying APIs
directly, you will need a `tcobject.Object` with appropriate credentials for
the operation.

To use the convenience upload methods:

```go
object := tcobject.New()
buf := []byte{"Hello I am data to upload"}
err := object.UploadFromBuf(projectID, name, contentType, expires, buf)
```

or:

```go
object := tcobject.New()
err := object.UploadFromFile(projectID, name, contentType, expires, filepath)
```

or:

```go
object := tcobject.New()
err := object.UploadFromReadSeeker(projectID, name, contentType, contentLength, expires, readSeeker)
```

To use the convenience download methods:

```go
object := tcobject.New()
data, contentType, contentLength, err := object.DownloadToBuf(name)
```

or:

```go
object := tcobject.New()
contentType, contentLength, err := object.DownloadToFile(name, filepath)
```

or:

```go
object := tcobject.New()
contentType, contentLength, err := object.DownloadToWriteSeeker(name, writeSeeker)
```

Note: the exponential backoff settings of the Object Service client
(`object.HTTPBackoffClient`) are also used when uploading/downloading data to
external URLs by these convenience methods.

### Downloading Artifacts

The `tcqueue` package provides convenience functions for downloading artifacts.
These functions apply the same best-practices as the object methods described above.

```go
queue := tcqueue.New()
data, contentType, contentLength, err := queue.DownloadArtifactToBuf(taskId, runId, name)
```

See the [Go documentation](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue) for more detail.

## Compatibility

This library is co-versioned with Taskcluster itself.
That is, a client with version x.y.z contains API methods corresponding to Taskcluster version x.y.z.
Taskcluster is careful to maintain API compatibility, and guarantees it within a major version.
That means that any client with version x.* will work against any Taskcluster services at version x.*, and is very likely to work for many other major versions of the Taskcluster services.
Any incompatibilities are noted in the [Changelog](https://github.com/taskcluster/taskcluster/blob/main/CHANGELOG.md).


## Examples

To get you started quickly, some example programs are included that use both the HTTP APIs and the AMQP APIs:

* This [HTTP example program](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcauth#example-package--Scopes) demonstrates the use of the [tcauth](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcauth) package to query the expiry and expanded scopes of a given clientId.
* This [HTTP example program](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcauth#example-package--UpdateClient) demonstrates the use of the [tcauth](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcauth) package to update an existing clientId with a new description and expiry.
* The [AMQP example program](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueueevents#example-package--TaskclusterSniffer) demonstrates the use of the [tcqueueevents](https://pkg.go.dev/github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueueevents) package to listen in on Taskcluster tasks being defined and executed.

### Creating a Task

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"
)

// *********************************************************
// These type definitions are copied from:
// https://github.com/taskcluster/generic-worker/blob/5cb2876624ce43974b1e1f96205535b037d63953/generated_windows.go#L11-L377
// *********************************************************
type (
	Artifact struct {

		// Explicitly set the value of the HTTP `Content-Type` response header when the artifact(s)
		// is/are served over HTTP(S). If not provided (this property is optional) the worker will
		// guess the content type of artifacts based on the filename extension of the file storing
		// the artifact content. It does this by looking at the system filename-to-mimetype mappings
		// defined in the Windows registry. Note, setting `contentType` on a directory artifact will
		// apply the same contentType to all files contained in the directory.
		//
		// See [mime.TypeByExtension](https://pkg.go.dev/mime#TypeByExtension).
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
	}

	// Requires scope `queue:get-artifact:<artifact-name>`.
	//
	// Since: generic-worker 5.4.0
	ArtifactContent struct {

		// Max length: 1024
		Artifact string `json:"artifact"`

		// The required SHA 256 of the content body.
		//
		// Since: generic-worker 10.8.0
		//
		// Syntax:     ^[a-f0-9]{64}$
		Sha256 string `json:"sha256,omitempty"`

		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		TaskID string `json:"taskId"`
	}

	// Base64 encoded content of file/archive, up to 64KB (encoded) in size.
	//
	// Since: generic-worker 11.1.0
	Base64Content struct {

		// Base64 encoded content of file/archive, up to 64KB (encoded) in size.
		//
		// Since: generic-worker 11.1.0
		//
		// Syntax:     ^[A-Za-z0-9/+]+[=]{0,2}$
		// Max length: 65536
		Base64 string `json:"base64"`
	}

	// By default tasks will be resolved with `state/reasonResolved`: `completed/completed`
	// if all task commands have a zero exit code, or `failed/failed` if any command has a
	// non-zero exit code. This payload property allows customsation of the task resolution
	// based on exit code of task commands.
	ExitCodeHandling struct {

		// Exit codes for any command in the task payload to cause this task to
		// be resolved as `exception/intermittent-task`. Typically the Queue
		// will then schedule a new run of the existing `taskId` (rerun) if not
		// all task runs have been exhausted.
		//
		// See [itermittent tasks](https://docs.taskcluster.net/docs/reference/platform/taskcluster-queue/docs/worker-interaction#intermittent-tasks) for more detail.
		//
		// Since: generic-worker 10.10.0
		//
		// Array items:
		// Mininum:    1
		Retry []int64 `json:"retry,omitempty"`
	}

	// Feature flags enable additional functionality.
	//
	// Since: generic-worker 5.3.0
	FeatureFlags struct {

		// An artifact named `public/chainOfTrust.json.asc` should be generated
		// which will include information for downstream tasks to build a level
		// of trust for the artifacts produced by the task and the environment
		// it ran in.
		//
		// Since: generic-worker 5.3.0
		ChainOfTrust bool `json:"chainOfTrust,omitempty"`

		// Runs commands with UAC elevation. Only set to true when UAC is
		// enabled on the worker and Administrative privileges are required by
		// task commands. When UAC is disabled on the worker, task commands will
		// already run with full user privileges, and therefore a value of true
		// will result in a malformed-payload task exception.
		//
		// A value of true does not add the task user to the `Administrators`
		// group - see the `osGroups` property for that. Typically
		// `task.payload.osGroups` should include an Administrative group, such
		// as `Administrators`, when setting to true.
		//
		// For security, `runAsAdministrator` feature cannot be used in
		// conjunction with `chainOfTrust` feature.
		//
		// Requires scope
		// `generic-worker:run-as-administrator:<provisionerId>/<workerType>`.
		//
		// Since: generic-worker 10.11.0
		RunAsAdministrator bool `json:"runAsAdministrator,omitempty"`

		// The taskcluster proxy provides an easy and safe way to make authenticated
		// taskcluster requests within the scope(s) of a particular task. See
		// [the github project](https://github.com/taskcluster/taskcluster/tree/main/tools/taskcluster-proxy) for more information.
		//
		// Since: generic-worker 10.6.0
		TaskclusterProxy bool `json:"taskclusterProxy,omitempty"`
	}

	FileMount struct {

		// One of:
		//   * ArtifactContent
		//   * URLContent
		//   * RawContent
		//   * Base64Content
		Content json.RawMessage `json:"content"`

		// The filesystem location to mount the file.
		//
		// Since: generic-worker 5.4.0
		File string `json:"file"`
	}

	// This schema defines the structure of the `payload` property referred to in a
	// Taskcluster Task definition.
	GenericWorkerPayload struct {

		// Artifacts to be published.
		//
		// Since: generic-worker 1.0.0
		Artifacts []Artifact `json:"artifacts,omitempty"`

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
		//
		// Array items:
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
		//
		// Map entries:
		Env map[string]string `json:"env,omitempty"`

		// Feature flags enable additional functionality.
		//
		// Since: generic-worker 5.3.0
		Features FeatureFlags `json:"features,omitempty"`

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
		//
		// Array items:
		// One of:
		//   * FileMount
		//   * WritableDirectoryCache
		//   * ReadOnlyDirectory
		Mounts []json.RawMessage `json:"mounts,omitempty"`

		// By default tasks will be resolved with `state/reasonResolved`: `completed/completed`
		// if all task commands have a zero exit code, or `failed/failed` if any command has a
		// non-zero exit code. This payload property allows customsation of the task resolution
		// based on exit code of task commands.
		OnExitStatus ExitCodeHandling `json:"onExitStatus,omitempty"`

		// A list of OS Groups that the task user should be a member of. Requires scope
		// `generic-worker:os-group:<provisionerId>/<workerType>/<os-group>` for each
		// group listed.
		//
		// Since: generic-worker 6.0.0
		//
		// Array items:
		OSGroups []string `json:"osGroups,omitempty"`

		// Specifies an artifact name for publishing RDP connection information.
		//
		// Since this is potentially sensitive data, care should be taken to publish
		// to a suitably locked down path, such as
		// `login-identity/<login-identity>/rdpinfo.json` which is only readable for
		// the given login identity (for example
		// `login-identity/mozilla-ldap/pmoore@mozilla.com/rdpinfo.json`). See the
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

	// Byte-for-byte literal inline content of file/archive, up to 64KB in size.
	//
	// Since: generic-worker 11.1.0
	RawContent struct {

		// Byte-for-byte literal inline content of file/archive, up to 64KB in size.
		//
		// Since: generic-worker 11.1.0
		//
		// Max length: 65536
		Raw string `json:"raw"`
	}

	ReadOnlyDirectory struct {

		// One of:
		//   * ArtifactContent
		//   * URLContent
		//   * RawContent
		//   * Base64Content
		Content json.RawMessage `json:"content"`

		// The filesystem location to mount the directory volume.
		//
		// Since: generic-worker 5.4.0
		Directory string `json:"directory"`

		// Archive format of content for read only directory.
		//
		// Since: generic-worker 5.4.0
		//
		// Possible values:
		//   * "rar"
		//   * "tar.bz2"
		//   * "tar.gz"
		//   * "zip"
		Format string `json:"format"`
	}

	// URL to download content from.
	//
	// Since: generic-worker 5.4.0
	URLContent struct {

		// The required SHA 256 of the content body.
		//
		// Since: generic-worker 10.8.0
		//
		// Syntax:     ^[a-f0-9]{64}$
		Sha256 string `json:"sha256,omitempty"`

		// URL to download content from.
		//
		// Since: generic-worker 5.4.0
		URL string `json:"url"`
	}

	WritableDirectoryCache struct {

		// Implies a read/write cache directory volume. A unique name for the
		// cache volume. Requires scope `generic-worker:cache:<cache-name>`.
		// Note if this cache is loaded from an artifact, you will also require
		// scope `queue:get-artifact:<artifact-name>` to use this cache.
		//
		// Since: generic-worker 5.4.0
		CacheName string `json:"cacheName"`

		// One of:
		//   * ArtifactContent
		//   * URLContent
		//   * RawContent
		//   * Base64Content
		Content json.RawMessage `json:"content,omitempty"`

		// The filesystem location to mount the directory volume.
		//
		// Since: generic-worker 5.4.0
		Directory string `json:"directory"`

		// Archive format of the preloaded content (if `content` provided).
		//
		// Since: generic-worker 5.4.0
		//
		// Possible values:
		//   * "rar"
		//   * "tar.bz2"
		//   * "tar.gz"
		//   * "zip"
		Format string `json:"format,omitempty"`
	}
)

func fatalOnError(err error) {
	if err != nil {
		log.Fatalf("Error:\n%v", err)
	}
}

func mustCompileToRawMessage(data any) *json.RawMessage {
	bytes, err := json.Marshal(data)
	fatalOnError(err)
	var JSON json.RawMessage
	err = json.Unmarshal(bytes, &JSON)
	fatalOnError(err)
	return &JSON
}

func main() {
	myQueue := tcqueue.NewFromEnv()
	taskID := slugid.Nice()
	created := time.Now()

	env := map[string]string{}

	payload := GenericWorkerPayload{
		Artifacts: []Artifact{},
		Command: []string{
			`echo Hello World!`,
		},
		Env: env,
		Features: FeatureFlags{
			ChainOfTrust: false,
		},
		MaxRunTime: 60,
		Mounts:     []json.RawMessage{},
		OSGroups:   []string{},
	}

	payloadJSON := mustCompileToRawMessage(payload)

	taskDef := &tcqueue.TaskDefinitionRequest{
		Created:      tcclient.Time(created),
		Deadline:     tcclient.Time(created.Add(time.Hour * 3)),
		Dependencies: []string{},
		Expires:      tcclient.Time(created.Add(time.Hour * 24)),
		Extra:        json.RawMessage("{}"),
		Metadata: tcqueue.TaskMetadata{
			Description: "xxxx",
			Name:        "xxxx",
			Owner:       "pmoore@mozilla.com",
			Source:      "https://hg.mozilla.org/try/file/xxxx",
		},
		Payload:       *payloadJSON,
		Priority:      "normal",
		ProvisionerID: "some-provisioner-id",
		Requires:      "all-completed",
		Retries:       5,
		Routes:        []string{},
		SchedulerID:   "-",
		Scopes:        []string{},
		Tags:          map[string]string{},
		TaskGroupID:   taskID,
		WorkerType:    "some-worker-type",
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

## Development

The libraries provided by this client are auto-generated based on the schema references in this repository.
This is done with the `yarn generate` command, run from the top level of the repository.

The code which generates the library can all be found under the top level [codegenerator](https://github.com/taskcluster/taskcluster/tree/main/clients/client-go/codegenerator)
directory.
