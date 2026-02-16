//go:build darwin || linux || freebsd

package main

import (
	"fmt"
	"runtime"
	"strings"
	"syscall"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
)

func (r *RunTaskAsCurrentUserTask) resetPlatformData() {
	r.task.pd = &process.PlatformData{}
	for _, c := range r.task.Commands {
		c.SysProcAttr.Credential = &syscall.Credential{}
	}
}

func (r *RunTaskAsCurrentUserTask) platformSpecificActions() *CommandExecutionError {
	if r.task.Payload.Env == nil {
		r.task.Payload.Env = make(map[string]string)
	}

	r.task.Payload.Env["TASK_USER_CREDENTIALS"] = ctuPath
	err := r.task.setVariable("TASK_USER_CREDENTIALS", ctuPath)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not set TASK_USER_CREDENTIALS environment variable: %v", err))
	}

	if runtime.GOOS == "linux" && !config.HeadlessTasks {
		delete(r.task.Payload.Env, "XDG_RUNTIME_DIR")
	}
	var newEnv []string
	for _, c := range r.task.Commands {
		for _, e := range c.Env {
			if !strings.HasPrefix(e, "XDG_RUNTIME_DIR=") {
				newEnv = append(newEnv, e)
			}
		}
		c.Env = newEnv
	}

	return nil
}
