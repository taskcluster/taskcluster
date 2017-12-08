// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/github/v1/api.json

// The github service, typically available at
// `github.taskcluster.net`, is responsible for publishing pulse
// messages in response to GitHub events.
//
// This document describes the API end-point for consuming GitHub
// web hooks, as well as some useful consumer APIs.
//
// When Github forbids an action, this service returns an HTTP 403
// with code ForbiddenByGithub.
//
// See: https://docs.taskcluster.net/reference/core/github/api-docs
//
// How to use this package
//
// First create a Github object:
//
//  myGithub := github.New(&tcclient.Credentials{ClientID: "myClientID", AccessToken: "myAccessToken"})
//
// and then call one or more of myGithub's methods, e.g.:
//
//  err := myGithub.GithubWebHookConsumer(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/github/v1/api.json together with the input and output schemas it references, downloaded on
// Fri, 8 Dec 2017 at 08:08:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package github

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

const (
	DefaultBaseURL = "https://github.taskcluster.net/v1"
)

type Github tcclient.Client

// New returns a Github client, configured to run against production. Pass in
// nil to load credentials from TASKCLUSTER_* environment variables. The
// returned client is mutable, so returned settings can be altered.
//
//  myGithub, err := github.New(nil)                           // credentials loaded from TASKCLUSTER_* env vars
//  if err != nil {
//      // handle malformed credentials...
//  }
//  myGithub.BaseURL = "http://localhost:1234/api/Github/v1"   // alternative API endpoint (production by default)
//  err := myGithub.GithubWebHookConsumer(.....)               // for example, call the GithubWebHookConsumer(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
//
// If authentication is not required, use NewNoAuth() instead.
func New(credentials *tcclient.Credentials) (*Github, error) {
	if credentials == nil {
		credentials = tcclient.CredentialsFromEnvVars()
	}
	err := credentials.Validate()
	myGithub := Github(tcclient.Client{
		Credentials:  credentials,
		BaseURL:      DefaultBaseURL,
		Authenticate: true,
	})
	return &myGithub, err
}

// NewNoAuth returns a Github client with authentication disabled. This is
// useful when calling taskcluster APIs that do not require authorization.
func NewNoAuth() *Github {
	myGithub := Github(tcclient.Client{
		BaseURL:      DefaultBaseURL,
		Authenticate: false,
	})
	return &myGithub
}

// Stability: *** EXPERIMENTAL ***
//
// Capture a GitHub event and publish it via pulse, if it's a push,
// release or pull request.
//
// See https://docs.taskcluster.net/reference/core/github/api-docs#githubWebHookConsumer
func (myGithub *Github) GithubWebHookConsumer() error {
	cd := tcclient.Client(*myGithub)
	_, _, err := (&cd).APICall(nil, "POST", "/github", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// A paginated list of builds that have been run in
// Taskcluster. Can be filtered on various git-specific
// fields.
//
// See https://docs.taskcluster.net/reference/core/github/api-docs#builds
func (myGithub *Github) Builds(continuationToken, limit, organization, repository, sha string) (*Builds1, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	if organization != "" {
		v.Add("organization", organization)
	}
	if repository != "" {
		v.Add("repository", repository)
	}
	if sha != "" {
		v.Add("sha", sha)
	}
	cd := tcclient.Client(*myGithub)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/builds", new(Builds1), v)
	return responseObject.(*Builds1), err
}

// Stability: *** EXPERIMENTAL ***
//
// Checks the status of the latest build of a given branch
// and returns corresponding badge svg.
//
// See https://docs.taskcluster.net/reference/core/github/api-docs#badge
func (myGithub *Github) Badge(owner, repo, branch string) error {
	cd := tcclient.Client(*myGithub)
	_, _, err := (&cd).APICall(nil, "GET", "/repository/"+url.QueryEscape(owner)+"/"+url.QueryEscape(repo)+"/"+url.QueryEscape(branch)+"/badge.svg", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Returns any repository metadata that is
// useful within Taskcluster related services.
//
// See https://docs.taskcluster.net/reference/core/github/api-docs#repository
func (myGithub *Github) Repository(owner, repo string) (*Repository1, error) {
	cd := tcclient.Client(*myGithub)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/repository/"+url.QueryEscape(owner)+"/"+url.QueryEscape(repo), new(Repository1), nil)
	return responseObject.(*Repository1), err
}

// Stability: *** EXPERIMENTAL ***
//
// For a given branch of a repository, this will always point
// to a status page for the most recent task triggered by that
// branch.
//
// Note: This is a redirect rather than a direct link.
//
// See https://docs.taskcluster.net/reference/core/github/api-docs#latest
func (myGithub *Github) Latest(owner, repo, branch string) error {
	cd := tcclient.Client(*myGithub)
	_, _, err := (&cd).APICall(nil, "GET", "/repository/"+url.QueryEscape(owner)+"/"+url.QueryEscape(repo)+"/"+url.QueryEscape(branch)+"/latest", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// For a given changeset (SHA) of a repository, this will attach a "commit status"
// on github. These statuses are links displayed next to each revision.
// The status is either OK (green check) or FAILURE (red cross),
// made of a custom title and link.
//
// Required scopes:
//   * github:create-status:<owner>/<repo>
//
// See https://docs.taskcluster.net/reference/core/github/api-docs#createStatus
func (myGithub *Github) CreateStatus(owner, repo, sha string, payload *CreateStatus1) error {
	cd := tcclient.Client(*myGithub)
	_, _, err := (&cd).APICall(payload, "POST", "/repository/"+url.QueryEscape(owner)+"/"+url.QueryEscape(repo)+"/statuses/"+url.QueryEscape(sha), nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// For a given Issue or Pull Request of a repository, this will write a new message.
//
// Required scopes:
//   * github:create-comment:<owner>/<repo>
//
// See https://docs.taskcluster.net/reference/core/github/api-docs#createComment
func (myGithub *Github) CreateComment(owner, repo, number string, payload *CreateComment1) error {
	cd := tcclient.Client(*myGithub)
	_, _, err := (&cd).APICall(payload, "POST", "/repository/"+url.QueryEscape(owner)+"/"+url.QueryEscape(repo)+"/issues/"+url.QueryEscape(number)+"/comments", nil, nil)
	return err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See https://docs.taskcluster.net/reference/core/github/api-docs#ping
func (myGithub *Github) Ping() error {
	cd := tcclient.Client(*myGithub)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
