//go:build insecure

package main

import (
	"testing"

	"github.com/taskcluster/taskcluster/v95/workers/generic-worker/gwconfig"
	gwruntime "github.com/taskcluster/taskcluster/v95/workers/generic-worker/runtime"
)

func engineTestSetup(t *testing.T, testConfig *gwconfig.Config) {
	t.Helper()
	testConfig.EnableD2G(t)
	// Needed for tests that don't call RunWorker()
	// but test methods/functions directly
	taskContext = &TaskContext{
		User:    &gwruntime.OSUser{},
		TaskDir: testdataDir,
	}
}
