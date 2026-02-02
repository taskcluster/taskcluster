//go:build multiuser && (darwin || linux || freebsd)

package main

import (
	"path/filepath"
	"runtime"
	"strings"
	"syscall"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
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

	// Write task user credentials to a task-specific file
	ctx := r.task.GetContext()
	if ctx != nil && ctx.User != nil {
		credsPath := filepath.Join(ctx.TaskDir, "task-user-credentials.json")
		err := fileutil.WriteToFileAsJSON(ctx.User, credsPath)
		if err == nil {
			r.task.Payload.Env["TASK_USER_CREDENTIALS"] = credsPath
			_ = r.task.setVariable("TASK_USER_CREDENTIALS", credsPath)
		}
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
