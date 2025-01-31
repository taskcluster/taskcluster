package main

import (
	"encoding/json"
	"fmt"
	"regexp"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v79/tools/d2g"
	"github.com/taskcluster/taskcluster/v79/tools/d2g/dockerworker"
	"github.com/taskcluster/taskcluster/v79/tools/jsonschema2go/text"

	"sigs.k8s.io/yaml"
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
	task.Definition.Scopes, err = d2g.ConvertScopes(task.Definition.Scopes, dwPayload, taskQueueID, serviceFactory.Auth(config.Credentials(), config.RootURL))
	if err != nil {
		return MalformedPayloadError(err)
	}

	// Convert dwPayload to gwPayload
	gwPayload, err := d2g.ConvertPayload(dwPayload, config.PublicPlatformConfig.D2GConfig)
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

	//////////////////////////////////////////////////////////////////////////////////
	//
	// horrible hack here, until we have jsonschema2go generating pointer types...
	//
	//////////////////////////////////////////////////////////////////////////////////
	re := regexp.MustCompile(`(?m)^\s*"expires": "0001-01-01T00:00:00.000Z",?\s*\n`)
	d2gConvertedPayloadJSON = re.ReplaceAll(d2gConvertedPayloadJSON, []byte{})

	err = json.Unmarshal(d2gConvertedPayloadJSON, &task.Payload)
	if err != nil {
		return MalformedPayloadError(err)
	}

	task.Definition.Payload = json.RawMessage(d2gConvertedPayloadJSON)

	// Convert full task definition to JSON
	d2gConvertedTaskDefinitionJSON, err := json.MarshalIndent(task.Definition, "", "  ")
	if err != nil {
		return executionError(malformedPayload, errored, fmt.Errorf("cannot marshal d2g converted task definition %#v to JSON: %s", task.Definition, err))
	}

	d2gConvertedTaskDefinitionYAML, err := yaml.JSONToYAML(d2gConvertedTaskDefinitionJSON)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not convert task definition from JSON to YAML: %v", err))
	}

	if !config.PublicPlatformConfig.NativePayloadsDisabled() {
		task.Warn("This task was designed to run under Docker Worker. Docker Worker is no longer maintained.")
		task.Warn("In order to execute this task, it is being converted to a Generic Worker task, using the D2G")
		task.Warn("utility (Docker Worker 2 Generic Worker):")
		task.Warn("    https://github.com/taskcluster/taskcluster/tree/main/clients/client-shell#translating-docker-worker-task-definitionpayload-to-generic-worker-task-definitionpayload")
		task.Warn("")
		task.Warn("We recommend that you convert all your Docker Worker tasks to Generic Worker tasks, to ensure")
		task.Warn("continued support. For this task, see the converted payload below. If you have many tasks that")
		task.Warn("require conversion, consider using the d2g tool (above) directly. It simply takes a Docker")
		task.Warn("Worker task payload as input, and outputs a Generic Worker task payload. It can also convert")
		task.Warn("Docker Worker scopes to equivalent Generic Worker scopes.")
		task.Warn("")
	}

	if config.PublicPlatformConfig.LogD2GTranslation() {
		task.Warn("Converted task definition (conversion performed by d2g):\n---\n" + text.Indent(string(d2gConvertedTaskDefinitionYAML), "  "))
	}

	return nil
}
