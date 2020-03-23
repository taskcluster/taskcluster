package logging

import (
	"github.com/taskcluster/taskcluster/v28/tools/worker-runner/logging"
	"github.com/taskcluster/taskcluster/v28/tools/worker-runner/protocol"
)

func SetProtocol(proto *protocol.Protocol) {
	// Register to receive log messages on the given protocol
	proto.AddCapability("log")
	proto.Register("log", func(msg protocol.Message) {
		body, ok := msg.Properties["body"]
		if ok {
			logging.Destination.LogStructured(body.(map[string]interface{}))
		} else {
			logging.Destination.LogUnstructured("received log message from worker lacking 'body' property")
		}
	})
}
