package main

import (
	"encoding/json"
	"testing"

	"github.com/taskcluster/taskcluster-client-go/queue"
)

// Badly formatted json payload should result in *json.SyntaxError error in task.validatePayload()
func TestBadPayloadValidate(t *testing.T) {

	// replace task update channels to use a dummy updater, in order to consume messages
	taskStatusUpdate, taskStatusUpdateErr, taskStatusDoneChan = func() (chan<- TaskStatusUpdate, <-chan error, chan<- bool) {
		r := make(chan TaskStatusUpdate)
		e := make(chan error)
		d := make(chan bool)
		go func() {
			for {
				select {
				case <-r:
					e <- nil
				case <-d:
					break
				}
			}
		}()
		return r, e, d
	}()

	badPayload := json.RawMessage(`bad payload, not even json`)
	task := TaskRun{Definition: queue.TaskDefinitionResponse{Payload: badPayload}}
	err := task.validatePayload()
	// kill task status updater
	taskStatusDoneChan <- true
	if err == nil {
		t.Fatalf("Bad task payload should not have passed validation")
	}
	if err.Reason != "malformed-payload" || err.TaskStatus != Errored {
		t.Errorf("Bad task payload should have retured malformed-payload, but actually returned:\n%#v", err)
	}
}
