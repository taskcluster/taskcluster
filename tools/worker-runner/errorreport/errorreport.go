package errorreport

import (
	"encoding/json"
	"log"
	"reflect"

	"github.com/pkg/errors"
	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/tc"
)

func HandleMessage(msg workerproto.Message, factory tc.WorkerManagerClientFactory, state *run.State) {
	validate := func(things map[string]interface{}, key, expectedType string) bool {
		if _, ok := things[key]; !ok {
			return false
		}
		if realType := reflect.TypeOf(things[key]); expectedType != realType.String() {
			log.Printf("got %s with type %#v, expected %s", key, realType.String(), expectedType)
			return false
		}
		return true
	}

	if !validate(msg.Properties, "description", "string") {
		log.Printf("Error processing error-report message, missing description or not string")
	}
	if !validate(msg.Properties, "kind", "string") {
		log.Printf("Error processing error-report message, missing kind or not string")
	}
	if !validate(msg.Properties, "title", "string") {
		log.Printf("Error processing error-report message, missing title or not string")
	}
	if !validate(msg.Properties, "extra", "map[string]interface {}") {
		log.Printf("Error processing error-report message, missing extra or not map[string]interface{}")
	}

	extra := msg.Properties["extra"].(map[string]interface{})
	extraMsg, err := json.Marshal(extra)
	if err != nil {
		log.Printf("Error processing error-report message, could not marshal extra")
	}

	errorReport := tcworkermanager.WorkerErrorReport{
		Description: msg.Properties["description"].(string),
		Kind:        msg.Properties["kind"].(string),
		Extra:       extraMsg,
		Title:       msg.Properties["title"].(string),
	}
	err = ReportWorkerError(state, factory, &errorReport)
	if err != nil {
		log.Printf("Error reporting worker error: %v\n", err)
	}
}

// ReportWorkerError will send a worker error report to worker-manager
func ReportWorkerError(state *run.State, factory tc.WorkerManagerClientFactory, payload *tcworkermanager.WorkerErrorReport) error {
	wc, err := factory(state.RootURL, &state.Credentials)
	if err != nil {
		return errors.Wrap(err, "error instanciating worker-manager client")
	}
	if _, err = wc.ReportWorkerError(state.WorkerPoolID, payload); err != nil {
		log.Printf("Error reporting worker error: %v", err)
		log.Printf("Error payload: %v", payload)
	}
	return err
}
