package main

import (
	"fmt"
	"path/filepath"
	"syscall"

	"github.com/taskcluster/taskcluster/v97/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v97/workers/generic-worker/process"
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
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("could not write task user credentials to %s: %v", credsPath, err))
		}
		err = fileutil.SecureFiles(credsPath)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("could not secure task user credentials file %s: %v", credsPath, err))
		}
		r.task.Payload.Env["TASK_USER_CREDENTIALS"] = credsPath
		err = r.task.setVariable("TASK_USER_CREDENTIALS", credsPath)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("could not set TASK_USER_CREDENTIALS environment variable: %v", err))
		}
	}

	return nil
}
