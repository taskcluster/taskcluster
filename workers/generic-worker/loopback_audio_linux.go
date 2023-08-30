//go:build linux

package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/host"
)

func (lat *LoopbackAudioTask) setupAudioDevice() *CommandExecutionError {
	opts := fmt.Sprintf("options snd-aloop enable=1 index=%d", config.LoopbackAudioDeviceNumber)
	out, err := host.CombinedOutput("/usr/bin/env", "bash", "-c", fmt.Sprintf("/usr/bin/echo %s > /etc/modprobe.d/snd-aloop.conf", opts))
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("Could not set snd-aloop kernel module options. Output: %s. Error: %v.", out, err))
	}

	out, err = host.CombinedOutput("/usr/sbin/modprobe", "snd-aloop")
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("Could not load the snd-aloop kernel module. Output: %s. Error: %v.", out, err))
	}

	for _, devicePath := range lat.devicePaths {
		out, err = host.CombinedOutput("/bin/chmod", "660", devicePath)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("Could not chmod 660 the %s device. Output: %s. Error: %v.", devicePath, out, err))
		}
	}

	for _, devicePath := range lat.devicePaths {
		err = makeFileOrDirReadWritableForUser(false, devicePath, taskContext.User)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("Could make the %s device readwritable for task user: %v", devicePath, err))
		}
	}

	lat.task.Infof("Loopback audio devices are available at %v", lat.devicePaths)

	return nil
}

func (lat *LoopbackAudioTask) resetAudioDevice() *CommandExecutionError {
	for _, devicePath := range lat.devicePaths {
		chownErr := makeDirUnreadableForUser(devicePath, taskContext.User)
		if chownErr != nil {
			return executionError(internalError, errored, fmt.Errorf("Could not remove %s's access from the %s device: %v", taskContext.User.Name, devicePath, chownErr))
		}
	}

	return nil
}
