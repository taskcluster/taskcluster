//go:build simple || docker

package main

import "github.com/taskcluster/taskcluster/v46/workers/generic-worker/gwconfig"

func setConfigRunTasksAsCurrentUser(*gwconfig.Config) {
}
