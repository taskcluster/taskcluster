package tcqueueevents_test

import (
	"fmt"

	"github.com/streadway/amqp"
	"github.com/taskcluster/pulse-go/pulse"
	"github.com/taskcluster/taskcluster/v88/clients/client-go/tcqueueevents"
)

func Example_taskclusterSniffer() {
	// Passing all empty strings:
	// empty user => use PULSE_USERNAME env var
	// empty password => use PULSE_PASSWORD env var
	// empty url => connect to production
	conn := pulse.NewConnection("", "", "")
	_, _ = conn.Consume(
		"taskprocessing", // queue name
		func(message any, delivery amqp.Delivery) { // callback function to pass messages to
			switch t := message.(type) {
			case *tcqueueevents.TaskDefinedMessage:
				fmt.Println("Task " + t.Status.TaskID + " defined")
				fmt.Println(string(delivery.Body))
			case *tcqueueevents.TaskRunningMessage:
				fmt.Println("Task " + t.Status.TaskID + " running, (taken until " + t.TakenUntil.String() + " by worker " + t.WorkerID + ")")
			default:
				panic(fmt.Errorf("Unrecognised message type %T!", t))
			}
			fmt.Println("===========")
			_ = delivery.Ack(false) // acknowledge message *after* processing
		},
		1,     // prefetch 1 message at a time
		false, // don't auto-acknowledge messages
		tcqueueevents.TaskDefined{WorkerType: "gaia", ProvisionerID: "aws-provisioner"},
		tcqueueevents.TaskRunning{WorkerType: "gaia", ProvisionerID: "aws-provisioner"})
	_, _ = conn.Consume( // a second workflow to manage concurrently
		"", // empty name implies anonymous queue
		func(message any, delivery amqp.Delivery) { // simpler callback than before
			fmt.Println("A buildbot message was received")
			fmt.Println("===========")
		},
		1,    // prefetch
		true, // auto acknowledge, so no need to call delivery.Ack
		pulse.Bind( // routing key and exchange to get messages from
			"#", // get *all* normalized buildbot messages
			"exchange/build/normalized"))
	// wait forever
	forever := make(chan bool)
	<-forever
}
