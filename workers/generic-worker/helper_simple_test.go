//go:build simple

package main

import "github.com/taskcluster/taskcluster/v54/workers/generic-worker/gwconfig"

func setConfigRunTasksAsCurrentUser(*gwconfig.Config) {
}
