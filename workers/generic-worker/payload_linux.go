//go:build linux

package main

import (
	"encoding/json"
	"fmt"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v54/tools/d2g"
	"github.com/taskcluster/taskcluster/v54/tools/d2g/dockerworker"
)

func (task *TaskRun) convertDockerWorkerPayload() *CommandExecutionError {
	jsonPayload := task.Definition.Payload

	// Convert the validated JSON input
	dwPayload := new(dockerworker.DockerWorkerPayload)
	defaults.SetDefaults(dwPayload)
	err := json.Unmarshal(jsonPayload, &dwPayload)
	if err != nil {
		return MalformedPayloadError(err)
	}

	// Convert dwPayload to gwPayload
	gwPayload, err := d2g.Convert(dwPayload)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("failed to convert docker worker payload to a generic worker payload: %v", err))
	}
	task.Definition.Scopes = d2g.Scopes(task.Definition.Scopes)

	// Convert gwPayload to JSON
	formattedActualGWPayload, err := json.MarshalIndent(*gwPayload, "", "  ")
	if err != nil {
		return executionError(malformedPayload, errored, fmt.Errorf("cannot convert Generic Worker payload %#v to JSON: %s", *gwPayload, err))
	}

	// Validate the JSON output against the schema
	validateErr := task.validateJSON(formattedActualGWPayload, JSONSchema())
	if validateErr != nil {
		return executionError(malformedPayload, errored, fmt.Errorf("d2g output validation failed: %v", validateErr))
	}

	err = json.Unmarshal(formattedActualGWPayload, &task.Payload)
	if err != nil {
		return MalformedPayloadError(err)
	}

	task.Infof("Generic Worker Payload:\n%s", string(formattedActualGWPayload))

	return nil
}
