//go:build multiuser && (darwin || linux || freebsd)

package main

import (
	"runtime"
	"syscall"

	"github.com/taskcluster/taskcluster/v81/workers/generic-worker/process"
)

func (r *RunTaskAsCurrentUserTask) resetPlatformData() {
	r.task.pd = &process.PlatformData{}
	for _, c := range r.task.Commands {
		c.SysProcAttr.Credential = &syscall.Credential{}
	}
}

func (r *RunTaskAsCurrentUserTask) platformSpecificActions() {
	if r.task.Payload.Env == nil {
		return
	}

	if runtime.GOOS == "linux" && !config.HeadlessTasks {
		delete(r.task.Payload.Env, "XDG_RUNTIME_DIR")
	}
}
