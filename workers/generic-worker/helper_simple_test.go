//go:build simple

package main

import "github.com/taskcluster/taskcluster/v57/workers/generic-worker/gwconfig"

func setConfigRunTasksAsCurrentUser(*gwconfig.Config) {
}
