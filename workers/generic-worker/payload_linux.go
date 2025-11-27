package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v94/tools/d2g"
	"github.com/taskcluster/taskcluster/v94/tools/d2g/dockerworker"
)

func (task *TaskRun) convertDockerWorkerPayload() *CommandExecutionError {
	jsonPayload := task.Definition.Payload

	// Convert the validated JSON input
	task.DockerWorkerPayload = new(dockerworker.DockerWorkerPayload)
	defaults.SetDefaults(task.DockerWorkerPayload)
	err := json.Unmarshal(jsonPayload, &task.DockerWorkerPayload)
	if err != nil {
		return MalformedPayloadError(err)
	}

	taskQueueID := task.Definition.TaskQueueID
	if taskQueueID == "" {
		taskQueueID = fmt.Sprintf("%s/%s", task.Definition.ProvisionerID, task.Definition.WorkerType)
	}
	if taskQueueID == "" {
		return executionError(malformedPayload, errored, fmt.Errorf("taskQueueId ('provisionerId/workerType') is required"))
	}

	// Validate that the required docker worker scopes
	// are present for the given docker worker payload
	// and then convert dwScopes to gwScopes
	task.Definition.Scopes, err = d2g.ConvertScopes(task.Definition.Scopes, task.DockerWorkerPayload, taskQueueID, serviceFactory.Auth(config.Credentials(), config.RootURL))
	if err != nil {
		return MalformedPayloadError(err)
	}

	// Convert task.DockerWorkerPayload to gwPayload
	gwPayload, conversionInfo, err := d2g.ConvertPayload(task.DockerWorkerPayload, config.D2GConfig, os.ReadDir)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("failed to convert docker worker payload to a generic worker payload: %v", err))
	}

	// Convert gwPayload to JSON
	d2gConvertedPayloadJSON, err := json.MarshalIndent(*gwPayload, "", "  ")
	if err != nil {
		return executionError(malformedPayload, errored, fmt.Errorf("cannot convert Generic Worker payload %#v to JSON: %s", *gwPayload, err))
	}

	// Validate the JSON output against the schema
	validateErr := task.validateJSON(d2gConvertedPayloadJSON, JSONSchema())
	if validateErr != nil {
		return executionError(malformedPayload, errored, fmt.Errorf("d2g output validation failed: %v", validateErr))
	}

	err = json.Unmarshal(d2gConvertedPayloadJSON, &task.Payload)
	if err != nil {
		return MalformedPayloadError(err)
	}

	task.Definition.Payload = json.RawMessage(d2gConvertedPayloadJSON)
	task.D2GInfo = &conversionInfo

	return nil
}

// Get an environment variable from the first command that has it set.
func (task *TaskRun) getVariable(variable string) (string, bool) {
	for _, cmd := range task.Commands {
		for _, envVar := range cmd.Env {
			if value, found := strings.CutPrefix(envVar, variable+"="); found {
				return value, true
			}
		}
	}
	return "", false
}
