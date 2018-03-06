// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/notify/v1/api.json

// The notification service, typically available at `notify.taskcluster.net`
// listens for tasks with associated notifications and handles requests to
// send emails and post pulse messages.
//
// See: https://docs.taskcluster.net/reference/core/notify/api-docs
//
// How to use this package
//
// First create a Notify object:
//
//  myNotify := notify.New(&tcclient.Credentials{ClientID: "myClientID", AccessToken: "myAccessToken"})
//
// and then call one or more of myNotify's methods, e.g.:
//
//  err := myNotify.Email(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/notify/v1/api.json together with the input and output schemas it references, downloaded on
// Tue, 6 Mar 2018 at 15:29:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package notify

import (
	tcclient "github.com/taskcluster/taskcluster-client-go"
)

const (
	DefaultBaseURL = "https://notify.taskcluster.net/v1"
)

type Notify tcclient.Client

// New returns a Notify client, configured to run against production. Pass in
// nil to load credentials from TASKCLUSTER_* environment variables. The
// returned client is mutable, so returned settings can be altered.
//
//  myNotify, err := notify.New(nil)                           // credentials loaded from TASKCLUSTER_* env vars
//  if err != nil {
//      // handle malformed credentials...
//  }
//  myNotify.BaseURL = "http://localhost:1234/api/Notify/v1"   // alternative API endpoint (production by default)
//  err := myNotify.Email(.....)                               // for example, call the Email(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
//
// If authentication is not required, use NewNoAuth() instead.
func New(credentials *tcclient.Credentials) (*Notify, error) {
	if credentials == nil {
		credentials = tcclient.CredentialsFromEnvVars()
	}
	err := credentials.Validate()
	myNotify := Notify(tcclient.Client{
		Credentials:  credentials,
		BaseURL:      DefaultBaseURL,
		Authenticate: true,
	})
	return &myNotify, err
}

// NewNoAuth returns a Notify client with authentication disabled. This is
// useful when calling taskcluster APIs that do not require authorization.
func NewNoAuth() *Notify {
	myNotify := Notify(tcclient.Client{
		BaseURL:      DefaultBaseURL,
		Authenticate: false,
	})
	return &myNotify
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
// See https://docs.taskcluster.net/reference/core/notify/api-docs#email
func (myNotify *Notify) Email(payload *SendEmailRequest) error {
	cd := tcclient.Client(*myNotify)
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
// See https://docs.taskcluster.net/reference/core/notify/api-docs#pulse
func (myNotify *Notify) Pulse(payload *PostPulseMessageRequest) error {
	cd := tcclient.Client(*myNotify)
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
// See https://docs.taskcluster.net/reference/core/notify/api-docs#irc
func (myNotify *Notify) Irc(payload *PostIRCMessageRequest) error {
	cd := tcclient.Client(*myNotify)
	_, _, err := (&cd).APICall(payload, "POST", "/irc", nil, nil)
	return err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See https://docs.taskcluster.net/reference/core/notify/api-docs#ping
func (myNotify *Notify) Ping() error {
	cd := tcclient.Client(*myNotify)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
