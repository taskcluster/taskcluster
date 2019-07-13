// Package pulse contains commands to interact with pulse..
package pulse

import (
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/taskcluster/taskcluster-cli/cmds/root"
	"github.com/taskcluster/taskcluster-client-go/queue"

	"github.com/spf13/cobra"

	"github.com/donovanhide/eventsource"
)

func init() {
	root.Command.AddCommand(&cobra.Command{
		Use:   "wait-for <taskId>",
		Short: "Wait for a task to be finished",
		RunE:  waitForTask,
	})
}

func waitForTask(cmd *cobra.Command, args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("%s expects argument <taskId>", cmd.Name())
	}

	type Binding struct {
		Exchange   string `json:"exchange"`
		RoutingKey string `json:"routingKeyPattern"`
	}

	type Bindings struct {
		Bindings []Binding `json:"bindings"`
	}

	routingKeyPattern := fmt.Sprintf("primary.%s.#", args[0])
	bindings := []Binding{
		Binding{
			"exchange/taskcluster-queue/v1/task-completed",
			routingKeyPattern},
		Binding{
			"exchange/taskcluster-queue/v1/task-failed",
			routingKeyPattern},
		Binding{
			"exchange/taskcluster-queue/v1/task-exception",
			routingKeyPattern},
	}

	jsonBindings, _ := json.Marshal(Bindings{Bindings: bindings})
	values := url.Values{"bindings": {string(jsonBindings)}}
	eventsURL := "https://events.taskcluster.net/v1/connect/?" + values.Encode()

	stream, err := eventsource.Subscribe(eventsURL, "")
	if err != nil {
		return fmt.Errorf("Error getting request: %v", err)
	}
	q := queue.New(nil)
	var pulseMessage map[string]interface{}

	for {
		event, ok := <-stream.Events
		if !ok {
			err := <-stream.Errors
			stream.Close()
			return fmt.Errorf("Error: %v", err)
		}
		if event.Event() == "ready" {
			status, err := q.Status(args[0])
			if err != nil {
				return fmt.Errorf("Error: %v", err)
			}
			state := status.Status.State
			if state == "completed" || state == "failed" || state == "exception" {
				fmt.Println(status.Status)
				return nil
			}
		}
		if event.Event() == "message" {
			json.Unmarshal([]byte(event.Data()), &pulseMessage)
			fmt.Println(pulseMessage["payload"])
			return nil
		}
	}
}
