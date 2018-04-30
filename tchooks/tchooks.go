// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://references.taskcluster.net/hooks/v1/api.json

// Hooks are a mechanism for creating tasks in response to events.
//
// Hooks are identified with a `hookGroupId` and a `hookId`.
//
// When an event occurs, the resulting task is automatically created.  The
// task is created using the scope `assume:hook-id:<hookGroupId>/<hookId>`,
// which must have scopes to make the createTask call, including satisfying all
// scopes in `task.scopes`.  The new task has a `taskGroupId` equal to its
// `taskId`, as is the convention for decision tasks.
//
// Hooks can have a "schedule" indicating specific times that new tasks should
// be created.  Each schedule is in a simple cron format, per
// https://www.npmjs.com/package/cron-parser.  For example:
//  * `['0 0 1 * * *']` -- daily at 1:00 UTC
//  * `['0 0 9,21 * * 1-5', '0 0 12 * * 0,6']` -- weekdays at 9:00 and 21:00 UTC, weekends at noon
//
// The task definition is used as a JSON-e template, with a context depending on how it is fired.  See
// https://docs.taskcluster.net/reference/core/taskcluster-hooks/docs/firing-hooks
// for more information.
//
// See: https://docs.taskcluster.net/reference/core/hooks/api-docs
//
// How to use this package
//
// First create a Hooks object:
//
//  hooks := tchooks.New(nil)
//
// and then call one or more of hooks's methods, e.g.:
//
//  data, err := hooks.ListHookGroups(.....)
//
// handling any errors...
//
//  if err != nil {
//  	// handle error...
//  }
//
// Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// https://references.taskcluster.net/hooks/v1/api.json together with the input and output schemas it references, downloaded on
// Mon, 30 Apr 2018 at 11:53:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package tchooks

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

const (
	DefaultBaseURL = "https://hooks.taskcluster.net/v1"
)

type Hooks tcclient.Client

// New returns a Hooks client, configured to run against production. Pass in
// nil to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  hooks := tchooks.New(nil)                              // client without authentication
//  hooks.BaseURL = "http://localhost:1234/api/Hooks/v1"   // alternative API endpoint (production by default)
//  data, err := hooks.ListHookGroups(.....)               // for example, call the ListHookGroups(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Hooks {
	return &Hooks{
		Credentials:  credentials,
		BaseURL:      DefaultBaseURL,
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns a Hooks client with credentials taken from the environment variables:
//
//  TASKCLUSTER_CLIENT_ID
//  TASKCLUSTER_ACCESS_TOKEN
//  TASKCLUSTER_CERTIFICATE
//
// If environment variables TASKCLUSTER_CLIENT_ID is empty string or undefined
// authentication will be disabled.
func NewFromEnv() *Hooks {
	c := tcclient.CredentialsFromEnvVars()
	return &Hooks{
		Credentials:  c,
		BaseURL:      DefaultBaseURL,
		Authenticate: c.ClientID != "",
	}
}

// This endpoint will return a list of all hook groups with at least one hook.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#listHookGroups
func (hooks *Hooks) ListHookGroups() (*HookGroups, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks", new(HookGroups), nil)
	return responseObject.(*HookGroups), err
}

// This endpoint will return a list of all the hook definitions within a
// given hook group.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#listHooks
func (hooks *Hooks) ListHooks(hookGroupId string) (*HookList, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId), new(HookList), nil)
	return responseObject.(*HookList), err
}

// This endpoint will return the hook definition for the given `hookGroupId`
// and hookId.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#hook
func (hooks *Hooks) Hook(hookGroupId, hookId string) (*HookDefinition, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), err
}

// This endpoint will return the current status of the hook.  This represents a
// snapshot in time and may vary from one call to the next.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#getHookStatus
func (hooks *Hooks) GetHookStatus(hookGroupId, hookId string) (*HookStatusResponse, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/status", new(HookStatusResponse), nil)
	return responseObject.(*HookStatusResponse), err
}

// Stability: *** DEPRECATED ***
//
// This endpoint will return the schedule and next scheduled creation time
// for the given hook.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#getHookSchedule
func (hooks *Hooks) GetHookSchedule(hookGroupId, hookId string) (*HookScheduleResponse, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/schedule", new(HookScheduleResponse), nil)
	return responseObject.(*HookScheduleResponse), err
}

// This endpoint will create a new hook.
//
// The caller's credentials must include the role that will be used to
// create the task.  That role must satisfy task.scopes as well as the
// necessary scopes to add the task to the queue.
//
// Required scopes:
//   All of:
//   * hooks:modify-hook:<hookGroupId>/<hookId>
//   * assume:hook-id:<hookGroupId>/<hookId>
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#createHook
func (hooks *Hooks) CreateHook(hookGroupId, hookId string, payload *HookCreationRequest) (*HookDefinition, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), err
}

// This endpoint will update an existing hook.  All fields except
// `hookGroupId` and `hookId` can be modified.
//
// Required scopes:
//   All of:
//   * hooks:modify-hook:<hookGroupId>/<hookId>
//   * assume:hook-id:<hookGroupId>/<hookId>
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#updateHook
func (hooks *Hooks) UpdateHook(hookGroupId, hookId string, payload *HookCreationRequest) (*HookDefinition, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), err
}

// This endpoint will remove a hook definition.
//
// Required scopes:
//   hooks:modify-hook:<hookGroupId>/<hookId>
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#removeHook
func (hooks *Hooks) RemoveHook(hookGroupId, hookId string) error {
	cd := tcclient.Client(*hooks)
	_, _, err := (&cd).APICall(nil, "DELETE", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), nil, nil)
	return err
}

// This endpoint will trigger the creation of a task from a hook definition.
//
// The HTTP payload must match the hooks `triggerSchema`.  If it does, it is
// provided as the `payload` property of the JSON-e context used to render the
// task template.
//
// Required scopes:
//   hooks:trigger-hook:<hookGroupId>/<hookId>
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#triggerHook
func (hooks *Hooks) TriggerHook(hookGroupId, hookId string, payload *TriggerHookRequest) (*TaskStatusStructure, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/trigger", new(TaskStatusStructure), nil)
	return responseObject.(*TaskStatusStructure), err
}

// Retrieve a unique secret token for triggering the specified hook. This
// token can be deactivated with `resetTriggerToken`.
//
// Required scopes:
//   hooks:get-trigger-token:<hookGroupId>/<hookId>
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#getTriggerToken
func (hooks *Hooks) GetTriggerToken(hookGroupId, hookId string) (*TriggerTokenResponse, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/token", new(TriggerTokenResponse), nil)
	return responseObject.(*TriggerTokenResponse), err
}

// Returns a signed URL for GetTriggerToken, valid for the specified duration.
//
// Required scopes:
//   hooks:get-trigger-token:<hookGroupId>/<hookId>
//
// See GetTriggerToken for more details.
func (hooks *Hooks) GetTriggerToken_SignedURL(hookGroupId, hookId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*hooks)
	return (&cd).SignedURL("/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/token", nil, duration)
}

// Reset the token for triggering a given hook. This invalidates token that
// may have been issued via getTriggerToken with a new token.
//
// Required scopes:
//   hooks:reset-trigger-token:<hookGroupId>/<hookId>
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#resetTriggerToken
func (hooks *Hooks) ResetTriggerToken(hookGroupId, hookId string) (*TriggerTokenResponse, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/token", new(TriggerTokenResponse), nil)
	return responseObject.(*TriggerTokenResponse), err
}

// This endpoint triggers a defined hook with a valid token.
//
// The HTTP payload must match the hooks `triggerSchema`.  If it does, it is
// provided as the `payload` property of the JSON-e context used to render the
// task template.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#triggerHookWithToken
func (hooks *Hooks) TriggerHookWithToken(hookGroupId, hookId, token string, payload *TriggerHookRequest) (*TaskStatusStructure, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/trigger/"+url.QueryEscape(token), new(TaskStatusStructure), nil)
	return responseObject.(*TaskStatusStructure), err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#ping
func (hooks *Hooks) Ping() error {
	cd := tcclient.Client(*hooks)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
