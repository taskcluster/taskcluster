//go:build multiuser

package main

import (
	"testing"

	"github.com/taskcluster/taskcluster/v54/clients/client-go/tcqueue"
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
