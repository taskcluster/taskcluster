//go:build simple || docker

package main

import "github.com/taskcluster/taskcluster/v49/workers/generic-worker/gwconfig"

func setConfigRunTasksAsCurrentUser(*gwconfig.Config) {
}
