package main

import (
	"fmt"
	"slices"

	"github.com/taskcluster/taskcluster/v94/internal/scopes"
	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/host"
)

type LoopbackAudioFeature struct {
}

func (feature *LoopbackAudioFeature) Name() string {
	return "LoopbackAudio"
}

func (feature *LoopbackAudioFeature) Initialise() error {
	return nil
}

func (feature *LoopbackAudioFeature) IsEnabled() bool {
	return config.EnableLoopbackAudio
}

func (feature *LoopbackAudioFeature) IsRequested(task *TaskRun) bool {
	return task.Payload.Features.LoopbackAudio
}

func (feature *LoopbackAudioFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &LoopbackAudioTask{
		task: task,
		devicePaths: []string{
			fmt.Sprintf("/dev/snd/controlC%d", config.LoopbackAudioDeviceNumber),
			fmt.Sprintf("/dev/snd/pcmC%dD0c", config.LoopbackAudioDeviceNumber),
			fmt.Sprintf("/dev/snd/pcmC%dD0p", config.LoopbackAudioDeviceNumber),
			fmt.Sprintf("/dev/snd/pcmC%dD1c", config.LoopbackAudioDeviceNumber),
			fmt.Sprintf("/dev/snd/pcmC%dD1p", config.LoopbackAudioDeviceNumber),
		},
	}
}

type LoopbackAudioTask struct {
	task        *TaskRun
	devicePaths []string
}

func (lat *LoopbackAudioTask) RequiredScopes() scopes.Required {
	return scopes.Required{
		{"generic-worker:loopback-audio:" + config.ProvisionerID + "/" + config.WorkerType},
		{"generic-worker:loopback-audio"},
	}
}

func (lat *LoopbackAudioTask) ReservedArtifacts() []string {
	return []string{}
}

func (lat *LoopbackAudioTask) Start() *CommandExecutionError {
	if config.LoopbackAudioDeviceNumber > 31 {
		return executionError(internalError, errored, fmt.Errorf("loopback audio device number must be between 0 and 31, inclusive"))
	}

	if !slices.Contains(lat.task.Payload.OSGroups, "audio") && !slices.Contains(lat.task.Payload.OSGroups, "docker") {
		lat.task.Warn("Neither 'audio' nor 'docker' group is in the list of OS groups. Consider adding so that the loopback audio devices will work as expected.")
	}

	return lat.setupAudioDevice()
}

func (lat *LoopbackAudioTask) Stop(err *ExecutionErrors) {
}

func (lat *LoopbackAudioTask) setupAudioDevice() *CommandExecutionError {
	opts := fmt.Sprintf("options snd-aloop enable=1 index=%d", config.LoopbackAudioDeviceNumber)
	out, err := host.CombinedOutput("/usr/bin/env", "bash", "-c", fmt.Sprintf("/usr/bin/echo %s > /etc/modprobe.d/snd-aloop.conf", opts))
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not set snd-aloop kernel module options. Output: %s. Error: %v", out, err))
	}

	out, err = host.CombinedOutput("/usr/sbin/modprobe", "snd-aloop")
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not load the snd-aloop kernel module. Output: %s. Error: %v", out, err))
	}

	for _, devicePath := range lat.devicePaths {
		err = host.Run("/usr/bin/chgrp", "audio", devicePath)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("could not chgrp audio the %s device: %v", devicePath, err))
		}

		out, err = host.CombinedOutput("/bin/chmod", "660", devicePath)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("could not chmod 660 the %s device. Output: %s. Error: %v", devicePath, out, err))
		}
	}

	lat.task.Infof("Loopback audio devices are available at %v", lat.devicePaths)

	return nil
}
