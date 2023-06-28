//go:build linux

package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/host"
)

func (lvt *LoopbackVideoTask) setupVideoDevice() *CommandExecutionError {
	err := host.Run("/usr/sbin/modprobe", "v4l2loopback", fmt.Sprintf("video_nr=%d", config.LoopbackVideoDeviceNumber))
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("Could not load the v4l2loopback kernel module: %v", err))
	}

	err = host.Run("/bin/chmod", "660", lvt.devicePath)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("Could not chmod 660 the %s device: %v", lvt.devicePath, err))
	}

	err = makeFileOrDirReadWritableForUser(false, lvt.devicePath, taskContext.User)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("Could make the %s device readwritable for task user: %v", lvt.devicePath, err))
	}

	err = lvt.task.setVariable("TASKCLUSTER_VIDEO_DEVICE", lvt.devicePath)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("Could not set TASKCLUSTER_VIDEO_DEVICE environment variable: %v", err))
	}

	lvt.task.Infof("Loopback video device is available at %s", lvt.devicePath)

	return nil
}

func (lvt *LoopbackVideoTask) resetVideoDevice() *CommandExecutionError {
	chownErr := makeDirUnreadableForUser(lvt.devicePath, taskContext.User)
	if chownErr != nil {
		return executionError(internalError, errored, fmt.Errorf("Could not remove %s's access from the %s device: %v", taskContext.User.Name, lvt.devicePath, chownErr))
	}

	return nil
}
