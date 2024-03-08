//go:build simple

package main

import (
	"github.com/taskcluster/taskcluster/v60/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v60/workers/generic-worker/process"
)

func setConfigRunTasksAsCurrentUser(*gwconfig.Config) {
}

func newPlatformData(conf *gwconfig.Config) *process.PlatformData {
	return &process.PlatformData{}
}
