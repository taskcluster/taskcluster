// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run `go generate` in the
// clients/client-go/codegenerator/model subdirectory of the
// taskcluster git repository.

// This package was generated from the reference schema of
// the Github service, which is also published here:
//
//   * ${TASKCLUSTER_ROOT_URL}/references/github/v1/api.json
//
// where ${TASKCLUSTER_ROOT_URL} points to the root URL of
// your taskcluster deployment.

// The github service is responsible for creating tasks in response
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
// # How to use this package
//
// First create a Github object:
//
//	github := tcgithub.New(nil)
//
// and then call one or more of github's methods, e.g.:
//
//	err := github.Ping(.....)
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
// <rootUrl>/references/github/v1/api.json together with the input and output schemas it references,
package tcgithub

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
)

type Github tcclient.Client

// New returns a Github client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//	github := tcgithub.New(
//	    nil,                                      // client without authentication
//	    "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//	)
//	err := github.Ping(.....)                     // for example, call the Ping(.....) API endpoint (described further down)...
//	if err != nil {
//		// handle errors...
//	}
func New(credentials *tcclient.Credentials, rootURL string) *Github {
	return &Github{
		Credentials:  credentials,
		RootURL:      rootURL,
		ServiceName:  "github",
		APIVersion:   "v1",
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
//	TASKCLUSTER_CLIENT_ID
//	TASKCLUSTER_ACCESS_TOKEN
//	TASKCLUSTER_CERTIFICATE
//
// If TASKCLUSTER_CLIENT_ID is empty/unset, authentication will be
// disabled.
func NewFromEnv() *Github {
	c := tcclient.CredentialsFromEnvVars()
	rootURL := tcclient.RootURLFromEnvVars()
	return &Github{
		Credentials:  c,
		RootURL:      rootURL,
		ServiceName:  "github",
		APIVersion:   "v1",
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

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #lbheartbeat
func (github *Github) Lbheartbeat() error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(nil, "GET", "/__lbheartbeat__", nil, nil)
	return err
}

// Respond with the JSON version object.
// https://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md
//
// See #version
func (github *Github) Version() error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(nil, "GET", "/__version__", nil, nil)
	return err
}

// A paginated list of builds that have been run in
// Taskcluster. Can be filtered on various git-specific
// fields.
//
// Required scopes:
//
//	github:list-builds
//
// See #builds
func (github *Github) Builds(continuationToken, limit, organization, pullRequest, repository, sha string) (*BuildsResponse, error) {
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
	if pullRequest != "" {
		v.Add("pullRequest", pullRequest)
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

// Returns a signed URL for Builds, valid for the specified duration.
//
// Required scopes:
//
//	github:list-builds
//
// See Builds for more details.
func (github *Github) Builds_SignedURL(continuationToken, limit, organization, pullRequest, repository, sha string, duration time.Duration) (*url.URL, error) {
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
	if pullRequest != "" {
		v.Add("pullRequest", pullRequest)
	}
	if repository != "" {
		v.Add("repository", repository)
	}
	if sha != "" {
		v.Add("sha", sha)
	}
	cd := tcclient.Client(*github)
	return (&cd).SignedURL("/builds", v, duration)
}

// Cancel all running Task Groups associated with given repository and sha or pullRequest number
//
// Required scopes:
//
//	github:cancel-builds:<owner>:<repo>
//
// See #cancelBuilds
func (github *Github) CancelBuilds(owner, repo, pullRequest, sha string) (*BuildsResponse, error) {
	v := url.Values{}
	if pullRequest != "" {
		v.Add("pullRequest", pullRequest)
	}
	if sha != "" {
		v.Add("sha", sha)
	}
	cd := tcclient.Client(*github)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/builds/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/cancel", new(BuildsResponse), v)
	return responseObject.(*BuildsResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Checks the status of the latest build of a given branch
// and returns corresponding badge svg.
//
// Required scopes:
//
//	github:get-badge:<owner>:<repo>:<branch>
//
// See #badge
func (github *Github) Badge(owner, repo, branch string) error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(nil, "GET", "/repository/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/"+url.PathEscape(branch)+"/badge.svg", nil, nil)
	return err
}

// Returns a signed URL for Badge, valid for the specified duration.
//
// Required scopes:
//
//	github:get-badge:<owner>:<repo>:<branch>
//
// See Badge for more details.
func (github *Github) Badge_SignedURL(owner, repo, branch string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*github)
	return (&cd).SignedURL("/repository/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/"+url.PathEscape(branch)+"/badge.svg", nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// Returns any repository metadata that is
// useful within Taskcluster related services.
//
// Required scopes:
//
//	github:get-repository:<owner>:<repo>
//
// See #repository
func (github *Github) Repository(owner, repo string) (*RepositoryResponse, error) {
	cd := tcclient.Client(*github)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/repository/"+url.PathEscape(owner)+"/"+url.PathEscape(repo), new(RepositoryResponse), nil)
	return responseObject.(*RepositoryResponse), err
}

// Returns a signed URL for Repository, valid for the specified duration.
//
// Required scopes:
//
//	github:get-repository:<owner>:<repo>
//
// See Repository for more details.
func (github *Github) Repository_SignedURL(owner, repo string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*github)
	return (&cd).SignedURL("/repository/"+url.PathEscape(owner)+"/"+url.PathEscape(repo), nil, duration)
}

// For a given branch of a repository, this will always point
// to a status page for the most recent task triggered by that
// branch.
//
// Note: This is a redirect rather than a direct link.
//
// Required scopes:
//
//	github:latest-status:<owner>:<repo>:<branch>
//
// See #latest
func (github *Github) Latest(owner, repo, branch string) error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(nil, "GET", "/repository/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/"+url.PathEscape(branch)+"/latest", nil, nil)
	return err
}

// Returns a signed URL for Latest, valid for the specified duration.
//
// Required scopes:
//
//	github:latest-status:<owner>:<repo>:<branch>
//
// See Latest for more details.
func (github *Github) Latest_SignedURL(owner, repo, branch string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*github)
	return (&cd).SignedURL("/repository/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/"+url.PathEscape(branch)+"/latest", nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// For a given changeset (SHA) of a repository, this will attach a "commit status"
// on github. These statuses are links displayed next to each revision.
// The status is either OK (green check) or FAILURE (red cross),
// made of a custom title and link.
//
// Required scopes:
//
//	github:create-status:<owner>/<repo>
//
// See #createStatus
func (github *Github) CreateStatus(owner, repo, sha string, payload *CreateStatusRequest) error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(payload, "POST", "/repository/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/statuses/"+url.PathEscape(sha), nil, nil)
	return err
}

// For a given Issue or Pull Request of a repository, this will write a new message.
//
// Required scopes:
//
//	github:create-comment:<owner>/<repo>
//
// See #createComment
func (github *Github) CreateComment(owner, repo, number string, payload *CreateCommentRequest) error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(payload, "POST", "/repository/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/issues/"+url.PathEscape(number)+"/comments", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint allows to render the .taskcluster.yml file for a given event or payload.
// This is useful to preview the result of the .taskcluster.yml file before pushing it to
// the repository.
// Read more about the .taskcluster.yml file in the [documentation](https://docs.taskcluster.net/docs/reference/integrations/github/taskcluster-yml-v1)
//
// See #renderTaskclusterYml
func (github *Github) RenderTaskclusterYml(payload *RenderTaskclusterYmlInput) (*RenderTaskclusterYmlOutput, error) {
	cd := tcclient.Client(*github)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/taskcluster-yml", new(RenderTaskclusterYmlOutput), nil)
	return responseObject.(*RenderTaskclusterYmlOutput), err
}

// Respond with a service heartbeat.
//
// This endpoint is used to check on backing services this service
// depends on.
//
// See #heartbeat
func (github *Github) Heartbeat() error {
	cd := tcclient.Client(*github)
	_, _, err := (&cd).APICall(nil, "GET", "/__heartbeat__", nil, nil)
	return err
}
