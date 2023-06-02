//go:build simple

package main

import "github.com/taskcluster/taskcluster/v52/workers/generic-worker/gwconfig"

func setConfigRunTasksAsCurrentUser(*gwconfig.Config) {
}
