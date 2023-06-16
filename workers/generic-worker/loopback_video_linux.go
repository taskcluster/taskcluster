//go:build linux

package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v53/workers/generic-worker/host"
)

func setupVideoDevice(task *TaskRun) *CommandExecutionError {
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

	err = task.setVariable("TASKCLUSTER_VIDEO_DEVICE", devicePath)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("Could not set TASKCLUSTER_VIDEO_DEVICE environment variable: %v", err))
	}

	task.Infof("Loopback video device is available at %s", devicePath)

	return nil
}

func resetVideoDevice() *CommandExecutionError {
	devicePath := fmt.Sprintf("/dev/video%d", config.LoopbackVideoDeviceNumber)
	chownErr := makeDirUnreadableForUser(devicePath, taskContext.User)
	if chownErr != nil {
		return executionError(internalError, errored, fmt.Errorf("Could not remove %s's access from the %s device: %v", taskContext.User.Name, devicePath, chownErr))
	}

	return nil
}
