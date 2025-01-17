// This source code file is AUTO-GENERATED by github.com/taskcluster/jsonschema2go

package tchooks

import (
	"encoding/json"
	"errors"

	tcclient "github.com/taskcluster/taskcluster/v78/clients/client-go"
)

type (
	// Exchange and RoutingKeyPattern for each binding
	Binding struct {

		// Min length: 1
		Exchange string `json:"exchange"`

		// Min length: 1
		RoutingKeyPattern string `json:"routingKeyPattern"`
	}

	// Information about an unsuccessful firing of the hook
	FailedFire struct {

		// The error that occurred when firing the task.  This is typically,
		// but not always, an API error message.
		//
		// Additional properties allowed
		Error json.RawMessage `json:"error"`

		// Possible values:
		//   * "error"
		Result string `json:"result"`

		// The time the task was created.  This will not necessarily match `task.created`.
		Time tcclient.Time `json:"time"`
	}

	// Definition of a hook that can create tasks at defined times.
	HookCreationRequest struct {
		Bindings []Binding `json:"bindings,omitempty"`

		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 1000
		HookGroupID string `json:"hookGroupId,omitempty"`

		// Syntax:     ^([a-zA-Z0-9-_/]*)$
		// Min length: 1
		// Max length: 1000
		HookID string `json:"hookId,omitempty"`

		Metadata HookMetadata `json:"metadata"`

		// Definition of the times at which a hook will result in creation of a task.
		// If several patterns are specified, tasks will be created at any time
		// specified by one or more patterns.
		//
		// Default:    []
		//
		// Array items:
		// Cron-like specification for when tasks should be created.  The pattern is
		// parsed in a UTC context.
		// See [cron-parser on npm](https://www.npmjs.com/package/cron-parser).
		// Note that tasks may not be created at exactly the time specified.
		Schedule []string `json:"schedule,omitempty"`

		// Template for the task definition.  This is rendered using [JSON-e](https://json-e.js.org/)
		// as described in [firing hooks](/docs/reference/core/hooks/firing-hooks) to produce
		// a task definition that is submitted to the Queue service.
		//
		// Additional properties allowed
		Task json.RawMessage `json:"task"`

		// Default:    {
		//               "additionalProperties": false,
		//               "type": "object"
		//             }
		//
		// Additional properties allowed
		TriggerSchema json.RawMessage `json:"triggerSchema,omitempty"`
	}

	// Definition of a hook that will create tasks when defined events occur.
	HookDefinition struct {
		Bindings []Binding `json:"bindings,omitempty"`

		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 1000
		HookGroupID string `json:"hookGroupId"`

		// Syntax:     ^([a-zA-Z0-9-_/]*)$
		// Min length: 1
		// Max length: 1000
		HookID string `json:"hookId"`

		Metadata HookMetadata `json:"metadata"`

		// A list of cron-style definitions to represent a set of moments in (UTC) time.
		// If several patterns are specified, a given moment in time represented by
		// more than one pattern is considered only to be counted once, in other words
		// it is allowed for the cron patterns to overlap; duplicates are redundant.
		//
		// Array items:
		// Cron-like specification for when tasks should be created.  The pattern is
		// parsed in a UTC context.
		// See [cron-parser on npm](https://www.npmjs.com/package/cron-parser).
		Schedule []string `json:"schedule"`

		// Template for the task definition.  This is rendered using [JSON-e](https://json-e.js.org/)
		// as described in [firing hooks](/docs/reference/core/hooks/firing-hooks) to produce
		// a task definition that is submitted to the Queue service.
		//
		// Additional properties allowed
		Task json.RawMessage `json:"task"`

		// Additional properties allowed
		TriggerSchema json.RawMessage `json:"triggerSchema"`
	}

	// List of `hookGroupIds`.
	HookGroups struct {

		// Array items:
		Groups []string `json:"groups"`
	}

	// List of hooks
	HookList struct {
		Hooks []HookDefinition `json:"hooks"`
	}

	HookMetadata struct {

		// Long-form of the hook's purpose and behavior
		//
		// Max length: 32768
		Description string `json:"description"`

		// Whether to email the owner on an error creating the task.
		//
		// Default:    true
		EmailOnError bool `json:"emailOnError,omitempty"`

		// Human readable name of the hook
		//
		// Max length: 255
		Name string `json:"name"`

		// Email of the person or group responsible for this hook.
		//
		// Max length: 255
		Owner string `json:"owner"`
	}

	// A snapshot of the current status of a hook.
	HookStatusResponse struct {

		// Information about the last time this hook fired.  This property is only present
		// if the hook has fired at least once.
		//
		// One of:
		//   * SuccessfulFire
		//   * FailedFire
		//   * NoFire
		LastFire json.RawMessage `json:"lastFire"`

		// The next time this hook's task is scheduled to be created. This property
		// is only present if there is a scheduled next time. Some hooks don't have
		// any schedules.
		NextScheduledDate tcclient.Time `json:"nextScheduledDate,omitempty"`
	}

	// List of lastFires
	LastFiresList struct {

		// A continuation token is returned if there are more results than listed
		// here. You can optionally provide the token in the request payload to
		// load the additional results.
		ContinuationToken string `json:"continuationToken,omitempty"`

		LastFires []Var `json:"lastFires"`
	}

	// Information about no firing of the hook (e.g., a new hook)
	NoFire struct {

		// Possible values:
		//   * "no-fire"
		Result string `json:"result"`
	}

	// Another copy of the taskId, at the location where it was published in
	// Taskcluster versions before v42.  Prefer to use the top-level property,
	// as `status.taskId` may be removed in future versions.
	Status struct {

		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		TaskID string `json:"taskId,omitempty"`
	}

	// Information about a successful firing of the hook
	SuccessfulFire struct {

		// Possible values:
		//   * "success"
		Result string `json:"result"`

		// The task created
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		TaskID string `json:"taskId"`

		// The time the task was created.  This will not necessarily match `task.created`.
		Time tcclient.Time `json:"time"`
	}

	// A request to trigger a hook.  The payload must be a JSON object, and is used as the context
	// for a JSON-e rendering of the hook's task template, as described in "Firing Hooks".
	//
	// Additional properties allowed
	TriggerHookRequest json.RawMessage

	// Response to a `triggerHook` or `triggerHookWithToken` call.
	//
	// In most cases, this gives a `taskId`, but in cases where the hook template
	// does not generate a task, it is an empty object with no `taskId`.
	//
	// Any of:
	//   * TriggerHookResponse1
	//   * TriggerHookResponse2
	TriggerHookResponse json.RawMessage

	// Response identifying the created task
	TriggerHookResponse1 struct {

		// Another copy of the taskId, at the location where it was published in
		// Taskcluster versions before v42.  Prefer to use the top-level property,
		// as `status.taskId` may be removed in future versions.
		Status Status `json:"status,omitempty"`

		// TaskId of the task created by triggering the hook.
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		TaskID string `json:"taskId"`
	}

	// Empty response indicating no task was created
	TriggerHookResponse2 struct {
	}

	// Secret token for a trigger
	TriggerTokenResponse struct {
		Token string `json:"token"`
	}

	Var struct {

		// The error that occurred when firing the task. This is typically,
		// but not always, an API error message.
		Error string `json:"error"`

		// Possible values:
		//   * "schedule"
		//   * "triggerHook"
		//   * "triggerHookWithToken"
		//   * "pulseMessage"
		FiredBy string `json:"firedBy"`

		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 1000
		HookGroupID string `json:"hookGroupId"`

		// Syntax:     ^([a-zA-Z0-9-_/]*)$
		// Min length: 1
		// Max length: 1000
		HookID string `json:"hookId"`

		// Information about success or failure of firing of the hook
		//
		// Possible values:
		//   * "success"
		//   * "error"
		Result string `json:"result"`

		// Time when the task was created
		TaskCreateTime tcclient.Time `json:"taskCreateTime"`

		// Unique task identifier, this is UUID encoded as
		// [URL-safe base64](http://tools.ietf.org/html/rfc4648#section-5) and
		// stripped of `=` padding.
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		TaskID string `json:"taskId"`

		// Task state derived from tasks last run status.
		// This value can change through time as tasks are being scheduled, run and re-run.
		// If task doesn't exist or was just created, this value will default to `unknown`.
		//
		// Possible values:
		//   * "unknown"
		//   * "unscheduled"
		//   * "pending"
		//   * "running"
		//   * "completed"
		//   * "failed"
		//   * "exception"
		TaskState string `json:"taskState"`
	}
)

// MarshalJSON calls json.RawMessage method of the same name. Required since
// TriggerHookRequest is of type json.RawMessage...
func (m *TriggerHookRequest) MarshalJSON() ([]byte, error) {
	x := json.RawMessage(*m)
	return (&x).MarshalJSON()
}

// UnmarshalJSON is a copy of the json.RawMessage implementation.
func (m *TriggerHookRequest) UnmarshalJSON(data []byte) error {
	if m == nil {
		return errors.New("TriggerHookRequest: UnmarshalJSON on nil pointer")
	}
	*m = append((*m)[0:0], data...)
	return nil
}

// MarshalJSON calls json.RawMessage method of the same name. Required since
// TriggerHookResponse is of type json.RawMessage...
func (m *TriggerHookResponse) MarshalJSON() ([]byte, error) {
	x := json.RawMessage(*m)
	return (&x).MarshalJSON()
}

// UnmarshalJSON is a copy of the json.RawMessage implementation.
func (m *TriggerHookResponse) UnmarshalJSON(data []byte) error {
	if m == nil {
		return errors.New("TriggerHookResponse: UnmarshalJSON on nil pointer")
	}
	*m = append((*m)[0:0], data...)
	return nil
}
