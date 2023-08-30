//go:build darwin || linux || freebsd

package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v54/internal/scopes"
)

type LoopbackAudioFeature struct {
}

func (feature *LoopbackAudioFeature) Name() string {
	return "LoopbackAudio"
}

func (feature *LoopbackAudioFeature) Initialise() error {
	return nil
}

func (feature *LoopbackAudioFeature) PersistState() error {
	return nil
}

func (feature *LoopbackAudioFeature) IsEnabled(task *TaskRun) bool {
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
		return executionError(internalError, errored, fmt.Errorf("LoopbackAudioDeviceNumber must be between 0 and 31, inclusive."))
	}

	return lat.setupAudioDevice()
}

func (lat *LoopbackAudioTask) Stop(err *ExecutionErrors) {
	err.add(lat.resetAudioDevice())
}
