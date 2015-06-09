// The following code is AUTO-GENERATED. Please DO NOT edit.

package main

import (
	"time"
)

type (
	// This schema defines the structure of the `payload` property referred to
	// in a Task Cluster Task definition.
	GenericWorkerPayload struct {
		// Artifact upload map example: ```{ "hosts": "/etc/hosts" }```
		Artifacts []struct {
			Path    string
			Expires time.Time
		}
		// Example: `['/bin/bash', '-c', 'build.sh']`.
		Command []string `json:"command"`
		// List of base64 encoded asymmetric encrypted environment variables.
		// See
		// http://docs.taskcluster.net/docker-worker/#encrypted-environment-variables
		EncryptedEnv []string `json:"encryptedEnv"`
		// Example: ```
		// {
		//   "PATH": '/borked/path'
		//   "ENV_NAME": "VALUE"
		// }
		// ```
		Env map[string]string `json:"env"`
		// Used to enable additional functionality.
		Features struct {
			Artifacts bool `json:"artifacts"`
			// Useful for situations where it is impossible to reach the worker
			// and parsing the azure livelog is possible
			AzureLiveLog bool `json:"azureLiveLog"`
			// Useful if live logging is not interesting but the overalllog is
			// later on
			BulkLog bool `json:"bulkLog"`
			// The `.graphs` property in payload allows specifying paths which
			// if present will be used to extend the task graph (Keeping it
			// alive) this can be used for dynamic tests, bisections, any
			// dynamic tasks, etc...
			ExtendTaskGraph bool `json:"extendTaskGraph"`
			// Logs are stored on the worker during the duration of tasks and
			// available via http chunked streaming then uploaded to s3
			LocalLiveLog bool `json:"localLiveLog"`
			// The auth proxy allows making requests to taskcluster/queue and
			// taskcluster/scheduler directly from your task with the same
			// scopes as set in the task. This can be used to make api calls
			// via the
			// [client](https://github.com/taskcluster/taskcluster-client)
			// CURL, etc... Without embedding credentials in the task.
			TaskclusterProxy bool `json:"taskclusterProxy"`
		} `json:"features"`
		// Contents of file are used to extend the graph (if this task was part
		// of a graph). See
		// http://docs.taskcluster.net/scheduler/api-docs/#extendTaskGraph
		Graphs []string `json:"graphs"`
		// Maximum time the task container can run in seconds
		MaxRunTime int `json:"maxRunTime"`
	}
)
