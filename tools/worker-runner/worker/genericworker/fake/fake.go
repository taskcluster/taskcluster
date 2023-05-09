package main

import (
	"fmt"
	"os"

	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
)

func main() {
	transp := workerproto.NewPipeTransport(os.Stdin, os.Stdout)
	proto := workerproto.NewProtocol(transp)
	proto.AddCapability("log")
	proto.Start(true)

	if proto.Capable("log") {
		proto.Send(workerproto.Message{
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
