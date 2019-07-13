// Package pulse contains commands to interact with pulse..
package pulse

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"

	"github.com/taskcluster/taskcluster-cli/cmds/root"

	"github.com/spf13/cobra"

	"github.com/donovanhide/eventsource"
)

func init() {
	root.Command.AddCommand(&cobra.Command{
		Use:   "inspect-pulse <exchange> <routingKeyPattern>",
		Short: "Bind to an exchange and receive pulse messages",
		RunE:  inspectPulse,
	})
}

func inspectPulse(cmd *cobra.Command, args []string) error {
	if len(args) < 2 {
		return errors.New("inspect-pulse requires arguments <exchange> and <routingKeyPattern>")
	}
	type Binding struct {
		Exchange   string `json:"exchange"`
		RoutingKey string `json:"routingKeyPattern"`
	}

	type Bindings struct {
		Bindings []Binding `json:"bindings"`
	}

	bindings := []Binding{
		Binding{
			args[0],
			args[1]}}

	jsonBindings, _ := json.Marshal(Bindings{Bindings: bindings})
	values := url.Values{"bindings": {string(jsonBindings)}}
	eventsURL := "https://events.taskcluster.net/v1/connect/?" + values.Encode()

	stream, err := eventsource.Subscribe(eventsURL, "")
	if err != nil {
		return fmt.Errorf("Error getting request: %v", err)
	}

	for {
		event, ok := <-stream.Events
		if !ok {
			err := <-stream.Errors
			stream.Close()
			return fmt.Errorf("Error: %v", err)
		}
		fmt.Println(event.Event(), event.Data())
	}
}
