// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run `go generate` in the
// clients/client-go/codegenerator/model subdirectory of the
// taskcluster git repository.

// This package was generated from the reference schema of
// the Hooks service, which is also published here:
//
//   * ${TASKCLUSTER_ROOT_URL}/references/hooks/v1/api.json
//
// where ${TASKCLUSTER_ROOT_URL} points to the root URL of
// your taskcluster deployment.

// The hooks service provides a mechanism for creating tasks in response to events.
//
// See:
//
// # How to use this package
//
// First create a Hooks object:
//
//	hooks := tchooks.New(nil)
//
// and then call one or more of hooks's methods, e.g.:
//
//	err := hooks.Ping(.....)
//
// handling any errors...
//
//	if err != nil {
//		// handle error...
//	}
//
// # Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// <rootUrl>/references/hooks/v1/api.json together with the input and output schemas it references,
package tchooks

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
)

type Hooks tcclient.Client

// New returns a Hooks client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//	hooks := tchooks.New(
//	    nil,                                      // client without authentication
//	    "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//	)
//	err := hooks.Ping(.....)                      // for example, call the Ping(.....) API endpoint (described further down)...
//	if err != nil {
//		// handle errors...
//	}
func New(credentials *tcclient.Credentials, rootURL string) *Hooks {
	return &Hooks{
		Credentials:  credentials,
		RootURL:      rootURL,
		ServiceName:  "hooks",
		APIVersion:   "v1",
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns a *Hooks configured from environment variables.
//
// The root URL is taken from TASKCLUSTER_PROXY_URL if set to a non-empty
// string, otherwise from TASKCLUSTER_ROOT_URL if set, otherwise the empty
// string.
//
// The credentials are taken from environment variables:
//
//	TASKCLUSTER_CLIENT_ID
//	TASKCLUSTER_ACCESS_TOKEN
//	TASKCLUSTER_CERTIFICATE
//
// If TASKCLUSTER_CLIENT_ID is empty/unset, authentication will be
// disabled.
func NewFromEnv() *Hooks {
	c := tcclient.CredentialsFromEnvVars()
	rootURL := tcclient.RootURLFromEnvVars()
	return &Hooks{
		Credentials:  c,
		RootURL:      rootURL,
		ServiceName:  "hooks",
		APIVersion:   "v1",
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (hooks *Hooks) Ping() error {
	cd := tcclient.Client(*hooks)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #lbheartbeat
func (hooks *Hooks) Lbheartbeat() error {
	cd := tcclient.Client(*hooks)
	_, _, err := (&cd).APICall(nil, "GET", "/__lbheartbeat__", nil, nil)
	return err
}

// Respond with the JSON version object.
// https://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md
//
// See #version
func (hooks *Hooks) Version() error {
	cd := tcclient.Client(*hooks)
	_, _, err := (&cd).APICall(nil, "GET", "/__version__", nil, nil)
	return err
}

// This endpoint will return a list of all hook groups with at least one hook.
//
// Required scopes:
//
//	hooks:list-hooks:
//
// See #listHookGroups
func (hooks *Hooks) ListHookGroups() (*HookGroups, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks", new(HookGroups), nil)
	return responseObject.(*HookGroups), err
}

// Returns a signed URL for ListHookGroups, valid for the specified duration.
//
// Required scopes:
//
//	hooks:list-hooks:
//
// See ListHookGroups for more details.
func (hooks *Hooks) ListHookGroups_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*hooks)
	return (&cd).SignedURL("/hooks", nil, duration)
}

// This endpoint will return a list of all the hook definitions within a
// given hook group.
//
// Required scopes:
//
//	hooks:list-hooks:<hookGroupId>
//
// See #listHooks
func (hooks *Hooks) ListHooks(hookGroupId string) (*HookList, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.PathEscape(hookGroupId), new(HookList), nil)
	return responseObject.(*HookList), err
}

// Returns a signed URL for ListHooks, valid for the specified duration.
//
// Required scopes:
//
//	hooks:list-hooks:<hookGroupId>
//
// See ListHooks for more details.
func (hooks *Hooks) ListHooks_SignedURL(hookGroupId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*hooks)
	return (&cd).SignedURL("/hooks/"+url.PathEscape(hookGroupId), nil, duration)
}

// This endpoint will return the hook definition for the given `hookGroupId`
// and hookId.
//
// Required scopes:
//
//	hooks:get:<hookGroupId>:<hookId>
//
// See #hook
func (hooks *Hooks) Hook(hookGroupId, hookId string) (*HookDefinition, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), err
}

// Returns a signed URL for Hook, valid for the specified duration.
//
// Required scopes:
//
//	hooks:get:<hookGroupId>:<hookId>
//
// See Hook for more details.
func (hooks *Hooks) Hook_SignedURL(hookGroupId, hookId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*hooks)
	return (&cd).SignedURL("/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId), nil, duration)
}

// Stability: *** DEPRECATED ***
//
// This endpoint will return the current status of the hook.  This represents a
// snapshot in time and may vary from one call to the next.
//
// This method is deprecated in favor of listLastFires.
//
// Required scopes:
//
//	hooks:status:<hookGroupId>/<hookId>
//
// See #getHookStatus
func (hooks *Hooks) GetHookStatus(hookGroupId, hookId string) (*HookStatusResponse, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId)+"/status", new(HookStatusResponse), nil)
	return responseObject.(*HookStatusResponse), err
}

// Returns a signed URL for GetHookStatus, valid for the specified duration.
//
// Required scopes:
//
//	hooks:status:<hookGroupId>/<hookId>
//
// See GetHookStatus for more details.
func (hooks *Hooks) GetHookStatus_SignedURL(hookGroupId, hookId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*hooks)
	return (&cd).SignedURL("/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId)+"/status", nil, duration)
}

// This endpoint will create a new hook.
//
// The caller's credentials must include the role that will be used to
// create the task.  That role must satisfy task.scopes as well as the
// necessary scopes to add the task to the queue.
//
// Required scopes:
//
//	All of:
//	* hooks:modify-hook:<hookGroupId>/<hookId>
//	* assume:hook-id:<hookGroupId>/<hookId>
//
// See #createHook
func (hooks *Hooks) CreateHook(hookGroupId, hookId string, payload *HookCreationRequest) (*HookDefinition, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), err
}

// This endpoint will update an existing hook.  All fields except
// `hookGroupId` and `hookId` can be modified.
//
// Required scopes:
//
//	All of:
//	* hooks:modify-hook:<hookGroupId>/<hookId>
//	* assume:hook-id:<hookGroupId>/<hookId>
//
// See #updateHook
func (hooks *Hooks) UpdateHook(hookGroupId, hookId string, payload *HookCreationRequest) (*HookDefinition, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId), new(HookDefinition), nil)
	return responseObject.(*HookDefinition), err
}

// This endpoint will remove a hook definition.
//
// Required scopes:
//
//	hooks:modify-hook:<hookGroupId>/<hookId>
//
// See #removeHook
func (hooks *Hooks) RemoveHook(hookGroupId, hookId string) error {
	cd := tcclient.Client(*hooks)
	_, _, err := (&cd).APICall(nil, "DELETE", "/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId), nil, nil)
	return err
}

// This endpoint will trigger the creation of a task from a hook definition.
//
// The HTTP payload must match the hooks `triggerSchema`.  If it does, it is
// provided as the `payload` property of the JSON-e context used to render the
// task template.
//
// Required scopes:
//
//	hooks:trigger-hook:<hookGroupId>/<hookId>
//
// See #triggerHook
func (hooks *Hooks) TriggerHook(hookGroupId, hookId string, payload *TriggerHookRequest) (*TriggerHookResponse, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId)+"/trigger", new(TriggerHookResponse), nil)
	return responseObject.(*TriggerHookResponse), err
}

// Retrieve a unique secret token for triggering the specified hook. This
// token can be deactivated with `resetTriggerToken`.
//
// Required scopes:
//
//	hooks:get-trigger-token:<hookGroupId>/<hookId>
//
// See #getTriggerToken
func (hooks *Hooks) GetTriggerToken(hookGroupId, hookId string) (*TriggerTokenResponse, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId)+"/token", new(TriggerTokenResponse), nil)
	return responseObject.(*TriggerTokenResponse), err
}

// Returns a signed URL for GetTriggerToken, valid for the specified duration.
//
// Required scopes:
//
//	hooks:get-trigger-token:<hookGroupId>/<hookId>
//
// See GetTriggerToken for more details.
func (hooks *Hooks) GetTriggerToken_SignedURL(hookGroupId, hookId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*hooks)
	return (&cd).SignedURL("/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId)+"/token", nil, duration)
}

// Reset the token for triggering a given hook. This invalidates token that
// may have been issued via getTriggerToken with a new token.
//
// Required scopes:
//
//	hooks:reset-trigger-token:<hookGroupId>/<hookId>
//
// See #resetTriggerToken
func (hooks *Hooks) ResetTriggerToken(hookGroupId, hookId string) (*TriggerTokenResponse, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId)+"/token", new(TriggerTokenResponse), nil)
	return responseObject.(*TriggerTokenResponse), err
}

// This endpoint triggers a defined hook with a valid token.
//
// The HTTP payload must match the hooks `triggerSchema`.  If it does, it is
// provided as the `payload` property of the JSON-e context used to render the
// task template.
//
// See #triggerHookWithToken
func (hooks *Hooks) TriggerHookWithToken(hookGroupId, hookId, token string, payload *TriggerHookRequest) (*TriggerHookResponse, error) {
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId)+"/trigger/"+url.PathEscape(token), new(TriggerHookResponse), nil)
	return responseObject.(*TriggerHookResponse), err
}

// This endpoint will return information about the the last few times this hook has been
// fired, including whether the hook was fired successfully or not
//
// By default this endpoint will return up to 1000 most recent fires in one request.
//
// Required scopes:
//
//	hooks:list-last-fires:<hookGroupId>/<hookId>
//
// See #listLastFires
func (hooks *Hooks) ListLastFires(hookGroupId, hookId, continuationToken, limit string) (*LastFiresList, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*hooks)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId)+"/last-fires", new(LastFiresList), v)
	return responseObject.(*LastFiresList), err
}

// Returns a signed URL for ListLastFires, valid for the specified duration.
//
// Required scopes:
//
//	hooks:list-last-fires:<hookGroupId>/<hookId>
//
// See ListLastFires for more details.
func (hooks *Hooks) ListLastFires_SignedURL(hookGroupId, hookId, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*hooks)
	return (&cd).SignedURL("/hooks/"+url.PathEscape(hookGroupId)+"/"+url.PathEscape(hookId)+"/last-fires", v, duration)
}

// Respond with a service heartbeat.
//
// This endpoint is used to check on backing services this service
// depends on.
//
// See #heartbeat
func (hooks *Hooks) Heartbeat() error {
	cd := tcclient.Client(*hooks)
	_, _, err := (&cd).APICall(nil, "GET", "/__heartbeat__", nil, nil)
	return err
}
