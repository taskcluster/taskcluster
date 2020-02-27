package main

import (
	"fmt"
	"io"
	"os"
	"time"

	"github.com/taskcluster/taskcluster/v28/tools/taskcluster-worker-runner/protocol"
)

func main() {
	transp := protocol.NewStdioTransport()
	go func() {
		_, _ = io.Copy(transp, os.Stdin)
	}()
	go func() {
		_, _ = io.Copy(os.Stdout, transp)
	}()
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
		// wait until the message is sent before exiting
		time.Sleep(100 * time.Millisecond)
	} else {
		fmt.Println("proto does not support log")
	}
}
