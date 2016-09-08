// The following code is AUTO-GENERATED. Please DO NOT edit.

// +build !windows

package main

import tcclient "github.com/taskcluster/taskcluster-client-go"

type (
	// This schema defines the structure of the `payload` property referred to
	// in a Task Cluster Task definition.
	GenericWorkerPayload struct {
		// Artifacts to be published. For example: `{ "type": "file", "path":
		// "builds\\firefox.exe", "expires": "2015-08-19T17:30:00.000Z" }`
		Artifacts []struct {
			// Date when artifact should expire must be in the future
			Expires tcclient.Time `json:"expires"`
			// Filesystem path of artifact
			Path string `json:"path"`
			// Artifacts can be either an individual `file` or a `directory`
			// containing potentially multiple files with recursively included
			// subdirectories
			Type string `json:"type"`
		} `json:"artifacts"`
		// One entry per command (consider each entry to be interpreted as a
		// full line of a Windows™ .bat file). For example: `["set", "echo
		// hello world > hello_world.txt", "set GOPATH=C:\\Go"]`.
		Command [][]string `json:"command"`
		// Example: ```{ "PATH": "C:\\Windows\\system32;C:\\Windows", "GOOS":
		// "darwin" }```
		Env map[string]string `json:"env"`
		// Feature flags enable additional functionality.
		Features EnabledFeatures `json:"features,omitempty"`
		// Maximum time the task container can run in seconds
		MaxRunTime int `json:"maxRunTime"`
	}
)
