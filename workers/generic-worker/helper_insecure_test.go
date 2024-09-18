//go:build insecure

package main

import (
	"github.com/taskcluster/taskcluster/v69/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v69/workers/generic-worker/process"
)

func setConfigRunTasksAsCurrentUser(*gwconfig.Config) {
}

func newPlatformData(conf *gwconfig.Config) *process.PlatformData {
	return &process.PlatformData{}
}
