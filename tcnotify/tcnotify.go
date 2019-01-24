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
// Thu, 4 Oct 2018 at 08:23:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package tcnotify

import (
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
