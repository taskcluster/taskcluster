package main

import (
	"fmt"
	"os"

	"github.com/taskcluster/taskcluster/v29/tools/worker-runner/protocol"
)

func main() {
	transp := protocol.NewPipeTransport(os.Stdin, os.Stdout)
	proto := protocol.NewProtocol(transp)
	proto.AddCapability("log")
	proto.Start(true)

	if proto.Capable("log") {
		proto.Send(protocol.Message{
			Type: "log",
			Properties: map[string]interface{}{
				"body": map[string]interface{}{
					"textPayload":       "workin hard or hardly workin, amirite?",
					"conversationLevel": "low",
				},
			},
		})
	} else {
		fmt.Println("proto does not support log")
	}
}
