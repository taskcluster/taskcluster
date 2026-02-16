//go:build insecure

package main

import (
	"testing"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v96/workers/generic-worker/runtime"
)

func engineTestSetup(t *testing.T, testConfig *gwconfig.Config) {
	t.Helper()
	testConfig.EnableD2G(t)
	// Needed for tests that don't call RunWorker()
	// but test methods/functions directly
	pd, err := process.TaskUserPlatformData(nil, false)
	if err != nil {
		t.Fatalf("Could not get platform data: %v", err)
	}
	testEnv := &TaskEnvironment{
		TaskDir:      testdataDir,
		User:         &gwruntime.OSUser{},
		PlatformData: pd,
	}
	pool = NewTaskEnvironmentPool(&StaticProvisioner{Env: testEnv}, 1)
	pool.SetForTest([]*TaskEnvironment{testEnv})
}
