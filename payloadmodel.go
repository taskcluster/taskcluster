// The following code is AUTO-GENERATED. Please DO NOT edit.

// +build !windows

package main

import tcclient "github.com/taskcluster/taskcluster-client-go"

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

		// One array per command (each command is an array of arguments). Several arrays
		// for several commands.
		Command [][]string `json:"command"`

		// Example: ```{ "PATH": "C:\\Windows\\system32;C:\\Windows", "GOOS": "darwin" }```
		Env map[string]string `json:"env,omitempty"`

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
	}
)
