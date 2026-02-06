package main

import (
	"path/filepath"
	"syscall"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
)

func (r *RunTaskAsCurrentUserTask) resetPlatformData() {
	r.task.pd = &process.PlatformData{
		LoginInfo: &process.LoginInfo{},
	}
	for _, c := range r.task.Commands {
		c.SysProcAttr.Token = syscall.Token(0)
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
			err = fileutil.SecureFiles(credsPath)
			if err != nil {
				panic(err)
			}
			r.task.Payload.Env["TASK_USER_CREDENTIALS"] = credsPath
			_ = r.task.setVariable("TASK_USER_CREDENTIALS", credsPath)
		}
	}

	return nil
}
