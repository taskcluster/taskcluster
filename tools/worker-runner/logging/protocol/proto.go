package logging

import (
	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/logging"
)

func SetProtocol(proto *workerproto.Protocol) {
	// Register to receive log messages on the given protocol
	proto.AddCapability("log")
	proto.Register("log", func(msg workerproto.Message) {
		body, ok := msg.Properties["body"]
		if ok {
			logging.Destination.LogStructured(body.(map[string]interface{}))
		} else {
			logging.Destination.LogUnstructured("received log message from worker lacking 'body' property")
		}
	})
}
