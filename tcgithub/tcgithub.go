// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://taskcluster-staging.net/references/github/v1/api.json

// The github service is responsible for creating tasks in reposnse
// to GitHub events, and posting results to the GitHub UI.
//
// This document describes the API end-point for consuming GitHub
// web hooks, as well as some useful consumer APIs.
//
// When Github forbids an action, this service returns an HTTP 403
// with code ForbiddenByGithub.
//
// See:
//
// How to use this package
//
// First create a Github object:
//
//  github := tcgithub.New(nil)
//
// and then call one or more of github's methods, e.g.:
//
//  err := github.Ping(.....)
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
// https://taskcluster-staging.net/references/github/v1/api.json together with the input and output schemas it references, downloaded on
// Mon, 25 Mar 2019 at 18:29:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package tcgithub

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type Github tcclient.Client

// New returns a Github client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  github := tcgithub.New(
//      nil,                                      // client without authentication
//      "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//  )
//  err := github.Ping(.....)                     // for example, call the Ping(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials, rootURL string) *Github {
	return &Github{
		Credentials:  credentials,
		BaseURL:      tcclient.BaseURL(rootURL, "github", "v1"),
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns a *Github configured from environment variables.
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
func NewFromEnv() *Github {
	c := tcclient.CredentialsFromEnvVars()
	return &Github{
		Credentials:  c,
		BaseURL:      tcclient.BaseURL(tcclient.RootURLFromEnvVars(), "github", "v1"),
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (github *Github) Ping() error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Capture a GitHub event and publish it via pulse, if it's a push,
// release or pull request.
//
// See #githubWebHookConsumer
func (github *Github) GithubWebHookConsumer() error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(nil, "POST", "/github", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// A paginated list of builds that have been run in
// Taskcluster. Can be filtered on various git-specific
// fields.
//
// See #builds
func (github *Github) Builds(continuationToken, limit, organization, repository, sha string) (*BuildsResponse, error) {
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
	cd := tcclient.Client(*github)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/builds", new(BuildsResponse), v)
	return responseObject.(*BuildsResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Checks the status of the latest build of a given branch
// and returns corresponding badge svg.
//
// See #badge
func (github *Github) Badge(owner, repo, branch string) error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(nil, "GET", "/repository/"+url.QueryEscape(owner)+"/"+url.QueryEscape(repo)+"/"+url.QueryEscape(branch)+"/badge.svg", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Returns any repository metadata that is
// useful within Taskcluster related services.
//
// See #repository
func (github *Github) Repository(owner, repo string) (*RepositoryResponse, error) {
	cd := tcclient.Client(*github)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/repository/"+url.QueryEscape(owner)+"/"+url.QueryEscape(repo), new(RepositoryResponse), nil)
	return responseObject.(*RepositoryResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// For a given branch of a repository, this will always point
// to a status page for the most recent task triggered by that
// branch.
//
// Note: This is a redirect rather than a direct link.
//
// See #latest
func (github *Github) Latest(owner, repo, branch string) error {
	cd := tcclient.Client(*github)
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
//   github:create-status:<owner>/<repo>
//
// See #createStatus
func (github *Github) CreateStatus(owner, repo, sha string, payload *CreateStatusRequest) error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(payload, "POST", "/repository/"+url.QueryEscape(owner)+"/"+url.QueryEscape(repo)+"/statuses/"+url.QueryEscape(sha), nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// For a given Issue or Pull Request of a repository, this will write a new message.
//
// Required scopes:
//   github:create-comment:<owner>/<repo>
//
// See #createComment
func (github *Github) CreateComment(owner, repo, number string, payload *CreateCommentRequest) error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(payload, "POST", "/repository/"+url.QueryEscape(owner)+"/"+url.QueryEscape(repo)+"/issues/"+url.QueryEscape(number)+"/comments", nil, nil)
	return err
}
