package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v81/internal/scopes"
	"github.com/taskcluster/taskcluster/v81/workers/generic-worker/host"
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

func (feature *LoopbackVideoFeature) IsEnabled() bool {
	return config.EnableLoopbackVideo
}

func (feature *LoopbackVideoFeature) IsRequested(task *TaskRun) bool {
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

func (lvt *LoopbackVideoTask) setupVideoDevice() *CommandExecutionError {
	err := host.Run("/usr/sbin/modprobe", "v4l2loopback", fmt.Sprintf("video_nr=%d", config.LoopbackVideoDeviceNumber))
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not load the v4l2loopback kernel module: %v", err))
	}

	err = host.Run("/bin/chmod", "660", lvt.devicePath)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not chmod 660 the %s device: %v", lvt.devicePath, err))
	}

	err = makeFileOrDirReadWritableForUser(false, lvt.devicePath, taskContext.User)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could make the %s device readwritable for task user: %v", lvt.devicePath, err))
	}

	err = lvt.task.setVariable("TASKCLUSTER_VIDEO_DEVICE", lvt.devicePath)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not set TASKCLUSTER_VIDEO_DEVICE environment variable: %v", err))
	}

	lvt.task.Infof("Loopback video device is available at %s", lvt.devicePath)

	return nil
}

func (lvt *LoopbackVideoTask) resetVideoDevice() *CommandExecutionError {
	chownErr := makeDirUnreadableForUser(lvt.devicePath, taskContext.User)
	if chownErr != nil {
		return executionError(internalError, errored, fmt.Errorf("could not remove %s's access from the %s device: %v", taskContext.User.Name, lvt.devicePath, chownErr))
	}

	return nil
}
