package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"time"

	"github.com/taskcluster/taskcluster/v83/internal/scopes"
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
		panic(err)
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
			panic(err)
		}
	}
	for _, artifact := range pvtf.task.Payload.Artifacts {
		// The default artifact expiry is task expiry, but is only applied when
		// the task artifacts are resolved. We intentionally don't modify
		// task.Payload otherwise it no longer reflects the real data defined
		// in the task.
		if !time.Time(artifact.Expires).IsZero() {
			// Don't be too strict: allow 1s discrepancy to account for
			// possible timestamp rounding on upstream systems
			if time.Time(artifact.Expires).Add(time.Second).Before(time.Time(pvtf.task.Definition.Deadline)) {
				return MalformedPayloadError(fmt.Errorf("malformed payload: artifact '%v' expires before task deadline (%v is before %v)", artifact.Path, artifact.Expires, pvtf.task.Definition.Deadline))
			}
			// Don't be too strict: allow 1s discrepancy to account for
			// possible timestamp rounding on upstream systems
			if time.Time(artifact.Expires).After(time.Time(pvtf.task.Definition.Expires).Add(time.Second)) {
				return MalformedPayloadError(fmt.Errorf("malformed payload: artifact '%v' expires after task expiry (%v is after %v)", artifact.Path, artifact.Expires, pvtf.task.Definition.Expires))
			}
		}
	}
	if pvtf.task.Payload.MaxRunTime > int64(config.MaxTaskRunTime) {
		return MalformedPayloadError(fmt.Errorf("task's maxRunTime of %d exceeded allowed maximum of %d", pvtf.task.Payload.MaxRunTime, config.MaxTaskRunTime))
	}
	return nil
}

func (pvtf *PayloadValidatorTaskFeature) Stop(err *ExecutionErrors) {
}
