package runner

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
)

func TestCredsExpiration(t *testing.T) {
	run := &Run{
		// message is sent 30 seconds before expiration, so set expiration
		// for 30s from now
		CredentialsExpire: time.Now().Add(30 * time.Second),
	}

	transp := protocol.NewFakeTransport()
	run.proto = protocol.NewProtocol(transp)
	run.proto.Capabilities.Add("graceful-termination")

	err := run.WorkerStarted()
	assert.NoError(t, err)

	// and wait until that happens
	for {
		time.Sleep(10 * time.Millisecond)
		haveMessage := len(transp.Messages()) != 0
		if haveMessage {
			break
		}
	}

	assert.Equal(t, []protocol.Message{
		protocol.Message{
			Type: "graceful-termination",
			Properties: map[string]interface{}{
				"finish-tasks": false,
			},
		},
	}, transp.Messages())

	err = run.WorkerFinished()
	assert.NoError(t, err)
}
