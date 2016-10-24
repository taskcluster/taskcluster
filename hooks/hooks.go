// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/hooks/v1/api.json

// Hooks are a mechanism for creating tasks in response to events.
//
// Hooks are identified with a `hookGroupId` and a `hookId`.
//
// When an event occurs, the resulting task is automatically created.  The
// task is created using the scope `assume:hook-id:<hookGroupId>/<hookId>`,
// which must have scopes to make the createTask call, including satisfying all
// scopes in `task.scopes`.
//
// Hooks can have a 'schedule' indicating specific times that new tasks should
// be created.  Each schedule is in a simple cron format, per
// https://www.npmjs.com/package/cron-parser.  For example:
//  * `["0 0 1 * * *"]` -- daily at 1:00 UTC
//  * `["0 0 9,21 * * 1-5", "0 0 12 * * 0,6"]` -- weekdays at 9:00 and 21:00 UTC, weekends at noon
//
// See: https://docs.taskcluster.net/reference/core/hooks/api-docs
//
// How to use this package
//
// First create a Hooks object:
//
//  myHooks := hooks.New(&tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of myHooks's methods, e.g.:
//
//  data, err := myHooks.ListHookGroups(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/hooks/v1/api.json together with the input and output schemas it references, downloaded on
// Mon, 24 Oct 2016 at 17:24:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package hooks

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type Hooks tcclient.ConnectionData

// Returns a pointer to Hooks, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false (in which case creds is
// ignored).
//
// For example:
//  creds := &tcclient.Credentials{
//  	ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
//  	AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
//  	Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
//  }
//  myHooks := hooks.New(creds)                              // set credentials
//  myHooks.Authenticate = false                             // disable authentication (creds above are now ignored)
//  myHooks.BaseURL = "http://localhost:1234/api/Hooks/v1"   // alternative API endpoint (production by default)
//  data, err := myHooks.ListHookGroups(.....)               // for example, call the ListHookGroups(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Hooks {
	myHooks := Hooks(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://hooks.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myHooks
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return a list of all hook groups with at least one hook.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#listHookGroups
func (myHooks *Hooks) ListHookGroups() (*HookGroups, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks", new(HookGroups), nil)
	return responseObject.(*HookGroups), err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return a list of all the hook definitions within a
// given hook group.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#listHooks
func (myHooks *Hooks) ListHooks(hookGroupId string) (*HookList, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId), new(HookList), nil)
	return responseObject.(*HookList), err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return the hook defintion for the given `hookGroupId`
// and hookId.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#hook
func (myHooks *Hooks) Hook(hookGroupId, hookId string) (*HookDefinition, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will return the current status of the hook.  This represents a
// snapshot in time and may vary from one call to the next.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#getHookStatus
func (myHooks *Hooks) GetHookStatus(hookGroupId, hookId string) (*HookStatusResponse, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/status", new(HookStatusResponse), nil)
	return responseObject.(*HookStatusResponse), err
}

// Stability: *** DEPRECATED ***
//
// This endpoint will return the schedule and next scheduled creation time
// for the given hook.
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#getHookSchedule
func (myHooks *Hooks) GetHookSchedule(hookGroupId, hookId string) (*HookScheduleResponse, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/schedule", new(HookScheduleResponse), nil)
	return responseObject.(*HookScheduleResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will create a new hook.
//
// The caller's credentials must include the role that will be used to
// create the task.  That role must satisfy task.scopes as well as the
// necessary scopes to add the task to the queue.
//
// Required scopes:
//   * hooks:modify-hook:<hookGroupId>/<hookId>, and
//   * assume:hook-id:<hookGroupId>/<hookId>
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#createHook
func (myHooks *Hooks) CreateHook(hookGroupId, hookId string, payload *HookCreationRequest) (*HookDefinition, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will update an existing hook.  All fields except
// `hookGroupId` and `hookId` can be modified.
//
// Required scopes:
//   * hooks:modify-hook:<hookGroupId>/<hookId>, and
//   * assume:hook-id:<hookGroupId>/<hookId>
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#updateHook
func (myHooks *Hooks) UpdateHook(hookGroupId, hookId string, payload *HookCreationRequest) (*HookDefinition, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will remove a hook definition.
//
// Required scopes:
//   * hooks:modify-hook:<hookGroupId>/<hookId>
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#removeHook
func (myHooks *Hooks) RemoveHook(hookGroupId, hookId string) error {
	cd := tcclient.ConnectionData(*myHooks)
	_, _, err := (&cd).APICall(nil, "DELETE", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId), nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint will trigger the creation of a task from a hook definition.
//
// Required scopes:
//   * hooks:trigger-hook:<hookGroupId>/<hookId>
//
// See https://docs.taskcluster.net/reference/core/hooks/api-docs#triggerHook
func (myHooks *Hooks) TriggerHook(hookGroupId, hookId string, payload *TriggerPayload) (*TaskStatusResponse, error) {
	cd := tcclient.ConnectionData(*myHooks)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/hooks/"+url.QueryEscape(hookGroupId)+"/"+url.QueryEscape(hookId)+"/trigger", new(TaskStatusResponse), nil)
	return responseObject.(*TaskStatusResponse), err
}
