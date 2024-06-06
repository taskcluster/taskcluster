package main

import "fmt"

func (lat *LoopbackAudioTask) setupAudioDevice() *CommandExecutionError {
	return executionError(malformedPayload, errored, fmt.Errorf("loopback audio device is not supported on macOS"))
}

func (lat *LoopbackAudioTask) resetAudioDevice() *CommandExecutionError {
	return nil
}
