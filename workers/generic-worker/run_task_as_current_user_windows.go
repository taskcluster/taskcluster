package main

import (
	"syscall"

	"github.com/taskcluster/taskcluster/v80/workers/generic-worker/process"
)

func (r *RunTaskAsCurrentUserTask) resetPlatformData() {
	r.task.pd = &process.PlatformData{
		LoginInfo: &process.LoginInfo{},
	}
	for _, c := range r.task.Commands {
		var token syscall.Token
		c.SysProcAttr.Token = token
	}
}

func (r *RunTaskAsCurrentUserTask) removeXDGRuntimeDirEnvVar() {
}
