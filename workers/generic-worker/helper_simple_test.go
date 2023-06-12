//go:build simple

package main

import "github.com/taskcluster/taskcluster/v53/workers/generic-worker/gwconfig"

func setConfigRunTasksAsCurrentUser(*gwconfig.Config) {
}
