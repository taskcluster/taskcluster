//go:build darwin || linux || freebsd

package main

import (
	"errors"
	"fmt"
	"os"
	"runtime"

	"github.com/taskcluster/taskcluster/v53/internal/scopes"
	"github.com/taskcluster/taskcluster/v53/workers/generic-worker/host"
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
		task: task,
	}
}

type LoopbackVideoTask struct {
	task *TaskRun
}

func (lvt *LoopbackVideoTask) RequiredScopes() scopes.Required {
	return scopes.Required{{
		"generic-worker:loopback-video:" + config.ProvisionerID + "/" + config.WorkerType,
	}}
}

func (lvt *LoopbackVideoTask) ReservedArtifacts() []string {
	return []string{}
}

func (lvt *LoopbackVideoTask) Start() *CommandExecutionError {
	if runtime.GOOS == "darwin" {
		return MalformedPayloadError(errors.New("Loopback video is not supported on darwin"))
	}

	err := host.Run("/usr/sbin/modprobe", "v4l2loopback", fmt.Sprintf("video_nr=%d", config.LoopbackVideoDeviceNumber))
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("Could not load the v4l2loopback kernel module: %v", err))
	}

	devicePath := fmt.Sprintf("/dev/video%d", config.LoopbackVideoDeviceNumber)
	err = host.Run("/bin/chmod", "660", devicePath)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("Could not chmod 660 the %s device: %v", devicePath, err))
	}

	err = makeFileOrDirReadWritableForUser(false, devicePath, taskContext.User)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("Could make the %s device readwritable for task user: %v", devicePath, err))
	}

	err = os.Setenv("TASKCLUSTER_VIDEO_DEVICE", devicePath)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("Could not set TASKCLUSTER_VIDEO_DEVICE environment variable: %v", err))
	}

	lvt.task.Infof("Loopback video device is available at %s", devicePath)

	return nil
}

func (lvt *LoopbackVideoTask) Stop(err *ExecutionErrors) {
	removeModuleErr := host.Run("/usr/sbin/modprobe", "-r", "v4l2loopback")
	if removeModuleErr != nil {
		err.add(executionError(internalError, errored, fmt.Errorf("Could not remove the v4l2loopback kernel module: %v", removeModuleErr)))
	}
}
