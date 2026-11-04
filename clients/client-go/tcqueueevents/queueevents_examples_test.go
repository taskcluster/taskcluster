package tcqueueevents_test

import (
	"encoding/json"
	"fmt"

	"github.com/taskcluster/taskcluster/v115/clients/client-go/tcqueueevents"
)

// Each binding type provides the exchange name and routing key pattern to bind
// a Pulse queue with, and a payload object to unmarshal message bodies into.
// These satisfy the pulse.Binding interface of
// https://pkg.go.dev/github.com/taskcluster/pulse-go/pulse.
func Example_binding() {
	binding := tcqueueevents.TaskDefined{WorkerType: "gaia", ProvisionerID: "aws-provisioner"}
	fmt.Println(binding.ExchangeName())
	fmt.Println(binding.RoutingKey())

	// body of a message received from the exchange
	body := []byte(`{"version": 1, "status": {"taskId": "eWIgwMgxSfeXQ36iPbOxiQ"}}`)
	message := binding.NewPayloadObject()
	if err := json.Unmarshal(body, message); err != nil {
		panic(err)
	}
	switch t := message.(type) {
	case *tcqueueevents.TaskDefinedMessage:
		fmt.Println("Task " + t.Status.TaskID + " defined")
	}

	// Output:
	// exchange/taskcluster-queue/v1/task-defined
	// *.*.*.*.*.aws-provisioner.gaia.*.*.#
	// Task eWIgwMgxSfeXQ36iPbOxiQ defined
}
