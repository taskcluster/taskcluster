//go:build insecure

package main

import (
	"fmt"
	"testing"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/gwconfig"
	gwruntime "github.com/taskcluster/taskcluster/v96/workers/generic-worker/runtime"
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

// printEnvVar prints the value of an environment variable
func printEnvVar(varName string) [][]string {
	return [][]string{
		{
			"/usr/bin/env",
			"bash",
			"-c",
			fmt.Sprintf("echo %s=$%s", varName, varName),
		},
	}
}
