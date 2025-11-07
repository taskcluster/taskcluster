package main

import (
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/taskcluster/taskcluster/v93/internal/scopes"
)

type (
	PayloadValidatorFeature struct {
	}

	PayloadValidatorTaskFeature struct {
		task *TaskRun
	}
)

func (pvf *PayloadValidatorFeature) Name() string {
	return "Payload Validator"
}

func (pvf *PayloadValidatorFeature) Initialise() (err error) {
	return nil
}

func (pvf *PayloadValidatorFeature) IsEnabled() bool {
	return true
}

func (pvf *PayloadValidatorFeature) IsRequested(task *TaskRun) bool {
	return true
}

func (pvf *PayloadValidatorFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &PayloadValidatorTaskFeature{
		task: task,
	}
}

func (pvtf *PayloadValidatorTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (pvtf *PayloadValidatorTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (pvtf *PayloadValidatorTaskFeature) Start() *CommandExecutionError {
	jsonPayload := pvtf.task.Definition.Payload
	validateErr := pvtf.task.validateJSON(jsonPayload, JSONSchema())
	if validateErr != nil {
		return validateErr
	}
	payload := map[string]any{}
	err := json.Unmarshal(jsonPayload, &payload)
	if err != nil {
		return executionError(internalError, errored, err)
	}
	workerPoolID := config.ProvisionerID + "/" + config.WorkerType
	workerManagerURL := config.RootURL + "/worker-manager/" + url.PathEscape(workerPoolID)
	if _, exists := payload["image"]; exists {
		if !config.D2GEnabled() {
			return MalformedPayloadError(fmt.Errorf(`docker worker payload detected, but D2G is not enabled on this worker pool (%s).
If you need D2G to translate your Docker Worker payload so Generic Worker can process it, please do one of two things:
	1. Contact the owner of the worker pool %s (see %s) and ask for D2G to be enabled.
	2. Use a worker pool that already allows docker worker payloads (search for "enableD2G": "true" in the worker pool definition)`, workerPoolID, workerPoolID, workerManagerURL))
		}
		err := pvtf.task.convertDockerWorkerPayload()
		if err != nil {
			return err
		}
	} else if config.NativePayloadsDisabled() {
		return MalformedPayloadError(fmt.Errorf("native Generic Worker payloads are disabled on this worker pool (%s)", workerPoolID))
	} else {
		err := json.Unmarshal(jsonPayload, &pvtf.task.Payload)
		if err != nil {
			return executionError(internalError, errored, err)
		}
	}
	return nil
}

func (pvtf *PayloadValidatorTaskFeature) Stop(err *ExecutionErrors) {
}
