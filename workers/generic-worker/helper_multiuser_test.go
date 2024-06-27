//go:build multiuser

package main

import (
	"testing"

	"github.com/taskcluster/taskcluster/v66/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v66/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v66/workers/generic-worker/process"
)

func expectChainOfTrustKeyNotSecureMessage(t *testing.T, td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload) {
	t.Helper()
	taskID := submitAndAssert(t, td, payload, "exception", "malformed-payload")

	expectedArtifacts := ExpectedArtifacts{
		"public/logs/live_backing.log": {
			Extracts: []string{
				ChainOfTrustKeyNotSecureMessage,
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
		},
		"public/logs/live.log": {
			Extracts: []string{
				ChainOfTrustKeyNotSecureMessage,
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
		},
	}

	expectedArtifacts.Validate(t, taskID, 0)
}

func newPlatformData(conf *gwconfig.Config) (pd *process.PlatformData) {
	pd, err := process.NewPlatformData(conf.RunTasksAsCurrentUser)
	if err != nil {
		panic(err)
	}
	return
}
