//go:build simple

package main

import (
	"context"
	"log"
	"os/exec"

	"github.com/taskcluster/taskcluster/v49/workers/generic-worker/process"
)

const (
	engine = "simple"
)

func platformFeatures() []Feature {
	return []Feature{
		&InteractiveFeature{},
	}
}

func secure(configFile string) {
	log.Printf("WARNING: can't secure generic-worker config file %q", configFile)
}

func (task *TaskRun) generateInteractiveCommand(ctx context.Context) (*exec.Cmd, error) {
	var processCmd *process.Command
	var err error

	if ctx == nil {
		processCmd, err = process.NewCommand([]string{"bash"}, taskContext.TaskDir, task.EnvVars())
	} else {
		processCmd, err = process.NewCommandContext(ctx, []string{"bash"}, taskContext.TaskDir, task.EnvVars())
	}

	return processCmd.Cmd, err
}
