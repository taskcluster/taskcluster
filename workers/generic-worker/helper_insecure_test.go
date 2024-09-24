//go:build insecure

package main

import (
	"testing"

	"github.com/taskcluster/taskcluster/v70/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v70/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v70/workers/generic-worker/runtime"
)

func engineTestSetup(t *testing.T, testConfig *gwconfig.Config) {
	t.Helper()
	// Needed for tests that don't call RunWorker()
	// but test methods/functions directly
	taskContext = &TaskContext{
		User:    &gwruntime.OSUser{},
		TaskDir: testdataDir,
		pd:      &process.PlatformData{},
	}
}
