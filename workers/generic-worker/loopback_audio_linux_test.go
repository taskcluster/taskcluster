//go:build linux

package main

import (
	"fmt"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
)

func TestLoopbackAudio(t *testing.T) {
	setup(t)

	devicePaths := []string{
		fmt.Sprintf("/dev/snd/controlC%d", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD0c", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD0p", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD1c", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD1p", config.LoopbackAudioDeviceNumber),
	}
	payload := GenericWorkerPayload{
		Command: [][]string{
			{"ls", "-l", devicePaths[0]},
			{"ls", "-l", devicePaths[1]},
			{"ls", "-l", devicePaths[2]},
			{"ls", "-l", devicePaths[3]},
			{"ls", "-l", devicePaths[4]},
		},
		MaxRunTime: 30,
		Features: FeatureFlags{
			LoopbackAudio: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:loopback-audio")

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	logText := LogText(t)
	if !strings.Contains(logText, "crw-rw----") {
		t.Fatalf("Expected log to contain 'crw-rw----', but it didn't\n%s", logText)
	}
}

func TestIncorrectLoopbackAudioScopes(t *testing.T) {
	setup(t)

	payload := GenericWorkerPayload{
		Command:    returnExitCode(0),
		MaxRunTime: 30,
		Features: FeatureFlags{
			LoopbackAudio: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)

	// don't set any scopes
	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, "generic-worker:loopback-audio:"+td.ProvisionerID+"/"+td.WorkerType) || !strings.Contains(logtext, "generic-worker:loopback-audio") {
		t.Fatalf("Expected log file to contain missing scopes, but it didn't\n%s", logtext)
	}
}

func TestLoopbackAudioNotOwnedByTaskUser(t *testing.T) {
	setup(t)

	devicePaths := []string{
		fmt.Sprintf("/dev/snd/controlC%d", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD0c", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD0p", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD1c", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD1p", config.LoopbackAudioDeviceNumber),
	}
	payload := GenericWorkerPayload{
		Command: [][]string{
			{"ls", "-l", devicePaths[0]},
		},
		MaxRunTime: 30,
		Features: FeatureFlags{
			// run once with loopback audio feature enabled,
			// so that we can ensure tbe device has been created
			// on the host
			LoopbackAudio: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:loopback-audio")

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	payload = GenericWorkerPayload{
		Command: [][]string{
			{"ls", "-l", devicePaths[0]},
		},
		MaxRunTime: 30,
		Features: FeatureFlags{
			// run a second time with the feature disabled
			// to test that the device is not owned by the
			// task user
			LoopbackAudio: false,
		},
	}
	defaults.SetDefaults(&payload)
	td = testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:loopback-audio")

	_ = submitAndAssert(t, td, payload, "completed", "completed")

	logtext := LogText(t)
	if strings.Contains(logtext, "task_") {
		t.Fatalf("Was not expecting `ls` on device %s to be owned by task user, but it was", devicePaths[0])
	}
}

func TestLoopbackAudioInvalidDeviceNumber(t *testing.T) {
	setup(t)

	config.LoopbackAudioDeviceNumber = 32

	devicePaths := []string{
		fmt.Sprintf("/dev/snd/controlC%d", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD0c", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD0p", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD1c", config.LoopbackAudioDeviceNumber),
		fmt.Sprintf("/dev/snd/pcmC%dD1p", config.LoopbackAudioDeviceNumber),
	}
	payload := GenericWorkerPayload{
		Command: [][]string{
			{"ls", "-l", devicePaths[0]},
			{"ls", "-l", devicePaths[1]},
			{"ls", "-l", devicePaths[2]},
			{"ls", "-l", devicePaths[3]},
			{"ls", "-l", devicePaths[4]},
		},
		MaxRunTime: 30,
		Features: FeatureFlags{
			LoopbackAudio: true,
		},
	}
	defaults.SetDefaults(&payload)
	td := testTask(t)
	td.Scopes = append(td.Scopes, "generic-worker:loopback-audio")

	_ = submitAndAssert(t, td, payload, "exception", "internal-error")
}
