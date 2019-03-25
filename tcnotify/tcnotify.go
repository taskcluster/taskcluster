// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://taskcluster-staging.net/references/notify/v1/api.json

// The notification service listens for tasks with associated notifications
// and handles requests to send emails and post pulse messages.
//
// See:
//
// How to use this package
//
// First create a Notify object:
//
//  notify := tcnotify.New(nil)
//
// and then call one or more of notify's methods, e.g.:
//
//  err := notify.Ping(.....)
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
// https://taskcluster-staging.net/references/notify/v1/api.json together with the input and output schemas it references, downloaded on
// Mon, 25 Mar 2019 at 18:29:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package tcnotify

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type Notify tcclient.Client

// New returns a Notify client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  notify := tcnotify.New(
//      nil,                                      // client without authentication
//      "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//  )
//  err := notify.Ping(.....)                     // for example, call the Ping(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials, rootURL string) *Notify {
	return &Notify{
		Credentials:  credentials,
		BaseURL:      tcclient.BaseURL(rootURL, "notify", "v1"),
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns a *Notify configured from environment variables.
//
// The root URL is taken from TASKCLUSTER_PROXY_URL if set to a non-empty
// string, otherwise from TASKCLUSTER_ROOT_URL if set, otherwise the empty
// string.
//
// The credentials are taken from environment variables:
//
//  TASKCLUSTER_CLIENT_ID
//  TASKCLUSTER_ACCESS_TOKEN
//  TASKCLUSTER_CERTIFICATE
//
// If TASKCLUSTER_CLIENT_ID is empty/unset, authentication will be
// disabled.
func NewFromEnv() *Notify {
	c := tcclient.CredentialsFromEnvVars()
	return &Notify{
		Credentials:  c,
		BaseURL:      tcclient.BaseURL(tcclient.RootURLFromEnvVars(), "notify", "v1"),
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (notify *Notify) Ping() error {
	cd := tcclient.Client(*notify)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Send an email to `address`. The content is markdown and will be rendered
// to HTML, but both the HTML and raw markdown text will be sent in the
// email. If a link is included, it will be rendered to a nice button in the
// HTML version of the email
//
// Required scopes:
//   notify:email:<address>
//
// See #email
func (notify *Notify) Email(payload *SendEmailRequest) error {
	cd := tcclient.Client(*notify)
	_, _, err := (&cd).APICall(payload, "POST", "/email", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Publish a message on pulse with the given `routingKey`.
//
// Required scopes:
//   notify:pulse:<routingKey>
//
// See #pulse
func (notify *Notify) Pulse(payload *PostPulseMessageRequest) error {
	cd := tcclient.Client(*notify)
	_, _, err := (&cd).APICall(payload, "POST", "/pulse", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Post a message on IRC to a specific channel or user, or a specific user
// on a specific channel.
//
// Success of this API method does not imply the message was successfully
// posted. This API method merely inserts the IRC message into a queue
// that will be processed by a background process.
// This allows us to re-send the message in face of connection issues.
//
// However, if the user isn't online the message will be dropped without
// error. We maybe improve this behavior in the future. For now just keep
// in mind that IRC is a best-effort service.
//
// Required scopes:
//   If channelRequest:
//     notify:irc-channel:<channel>
//
// See #irc
func (notify *Notify) Irc(payload *PostIRCMessageRequest) error {
	cd := tcclient.Client(*notify)
	_, _, err := (&cd).APICall(payload, "POST", "/irc", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Add the given address to the notification denylist. The address
// can be of either of the three supported address type namely pulse, email
// or IRC(user or channel). Addresses in the denylist will be ignored
// by the notification service.
//
// Required scopes:
//   notify:manage-denylist:<notificationType>/<notificationAddress>
//
// See #addDenylistAddress
func (notify *Notify) AddDenylistAddress(payload *NotificaitonTypeAndAddress) error {
	cd := tcclient.Client(*notify)
	_, _, err := (&cd).APICall(payload, "POST", "/denylist/add", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Delete the specified address from the notification denylist.
//
// Required scopes:
//   notify:manage-denylist:<notificationType>/<notificationAddress>
//
// See #deleteDenylistAddress
func (notify *Notify) DeleteDenylistAddress(payload *NotificaitonTypeAndAddress) error {
	cd := tcclient.Client(*notify)
	_, _, err := (&cd).APICall(payload, "DELETE", "/denylist/delete", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Lists all the denylisted addresses.
//
// By default this end-point will try to return up to 1000 addresses in one
// request. But it **may return less**, even if more tasks are available.
// It may also return a `continuationToken` even though there are no more
// results. However, you can only be sure to have seen all results if you
// keep calling `list` with the last `continuationToken` until you
// get a result without a `continuationToken`.
//
// If you are not interested in listing all the members at once, you may
// use the query-string option `limit` to return fewer.
//
// See #list
func (notify *Notify) List(continuationToken, limit string) (*ListOfNotificationAdresses, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*notify)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/denylist/list", new(ListOfNotificationAdresses), v)
	return responseObject.(*ListOfNotificationAdresses), err
}
