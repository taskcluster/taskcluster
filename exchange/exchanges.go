package main

import (
	"fmt"
	"github.com/petemoore/taskcluster-client-go/utils"
	"github.com/streadway/amqp"
)

func main() {
	// connection, err := amqp.Dial("amqps://pulse.mozilla.org/exchange/taskcluster-queue/v1/task-defined")
	connection, err := amqp.Dial("amqp://localhost/")
	utils.ExitOnFail(err)
	defer connection.Close()
	channel, err := connection.Channel()
	utils.ExitOnFail(err)
	_, err = channel.QueueDeclare("hello", false, false, false, false, nil)
	msg := amqp.Publishing{
		ContentType: "application/json",
		Body:        []byte(`{"name":"pmoore"}`)}
	channel.Publish("", "hello", false, false, msg)
	utils.ExitOnFail(err)
	fmt.Println("Published message")
}
