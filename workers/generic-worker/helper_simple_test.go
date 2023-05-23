//go:build simple

package main

import "github.com/taskcluster/taskcluster/v51/workers/generic-worker/gwconfig"

func setConfigRunTasksAsCurrentUser(*gwconfig.Config) {
}
