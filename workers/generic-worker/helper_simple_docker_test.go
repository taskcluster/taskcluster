// +build simple docker

package main

import "github.com/taskcluster/taskcluster/v43/workers/generic-worker/gwconfig"

func setConfigRunTasksAsCurrentUser(*gwconfig.Config) {
}
