// +build simple docker

package main

import "github.com/taskcluster/taskcluster/v33/workers/generic-worker/gwconfig"

func setConfigRunTasksAsCurrentUser(*gwconfig.Config) {
}
