package worker

import (
	"syscall"

	"github.com/taskcluster/taskcluster/v90/workers/generic-worker/process"
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
	return nil
}
