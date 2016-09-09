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
// web hooks
//
// See: https://docs.taskcluster.net/reference/core/github/api-docs
//
// How to use this package
//
// First create a Github object:
//
//  myGithub := github.New(&tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of myGithub's methods, e.g.:
//
//  err := myGithub.GithubWebHookConsumer(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/github/v1/api.json together with the input and output schemas it references, downloaded on
// Fri, 9 Sep 2016 at 18:23:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package github

import tcclient "github.com/taskcluster/taskcluster-client-go"

type Github tcclient.ConnectionData

// Returns a pointer to Github, configured to run against production.  If you
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
//  myGithub := github.New(creds)                              // set credentials
//  myGithub.Authenticate = false                              // disable authentication (creds above are now ignored)
//  myGithub.BaseURL = "http://localhost:1234/api/Github/v1"   // alternative API endpoint (production by default)
//  err := myGithub.GithubWebHookConsumer(.....)               // for example, call the GithubWebHookConsumer(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Github {
	myGithub := Github(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://github.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myGithub
}

// Stability: *** EXPERIMENTAL ***
//
// Capture a GitHub event and publish it via pulse, if it's a push
// or pull request.
//
// See https://docs.taskcluster.net/reference/core/github/api-docs#githubWebHookConsumer
func (myGithub *Github) GithubWebHookConsumer() error {
	cd := tcclient.ConnectionData(*myGithub)
	_, _, err := (&cd).APICall(nil, "POST", "/github", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See https://docs.taskcluster.net/reference/core/github/api-docs#ping
func (myGithub *Github) Ping() error {
	cd := tcclient.ConnectionData(*myGithub)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
