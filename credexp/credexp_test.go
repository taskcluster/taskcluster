package credexp

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/run"
)

func TestCredsExpiration(t *testing.T) {
	state := &run.State{
		// message is sent 30 seconds before expiration, so set expiration
		// for 30s from now
		CredentialsExpire: time.Now().Add(30 * time.Second),
	}

	ce := New(state)

	transp := protocol.NewFakeTransport()
	proto := protocol.NewProtocol(transp)
	proto.Capabilities.Add("graceful-termination")
	proto.SetInitialized()

	ce.SetProtocol(proto)

	err := ce.WorkerStarted()
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

	err = ce.WorkerFinished()
	assert.NoError(t, err)
}
