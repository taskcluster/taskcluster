//go:build darwin || linux || freebsd

package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v54/internal/scopes"
)

type LoopbackVideoFeature struct {
}

func (feature *LoopbackVideoFeature) Name() string {
	return "LoopbackVideo"
}

func (feature *LoopbackVideoFeature) Initialise() error {
	return nil
}

func (feature *LoopbackVideoFeature) PersistState() error {
	return nil
}

func (feature *LoopbackVideoFeature) IsEnabled(task *TaskRun) bool {
	return task.Payload.Features.LoopbackVideo
}

func (feature *LoopbackVideoFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &LoopbackVideoTask{
		task:       task,
		devicePath: fmt.Sprintf("/dev/video%d", config.LoopbackVideoDeviceNumber),
	}
}

type LoopbackVideoTask struct {
	task       *TaskRun
	devicePath string
}

func (lvt *LoopbackVideoTask) RequiredScopes() scopes.Required {
	return scopes.Required{
		{"generic-worker:loopback-video:" + config.ProvisionerID + "/" + config.WorkerType},
		{"generic-worker:loopback-video"},
	}
}

func (lvt *LoopbackVideoTask) ReservedArtifacts() []string {
	return []string{}
}

func (lvt *LoopbackVideoTask) Start() *CommandExecutionError {
	return lvt.setupVideoDevice()
}

func (lvt *LoopbackVideoTask) Stop(err *ExecutionErrors) {
	err.add(lvt.resetVideoDevice())
}
