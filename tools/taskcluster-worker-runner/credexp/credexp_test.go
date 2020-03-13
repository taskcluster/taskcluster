package credexp

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster/v28/tools/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster/v28/tools/taskcluster-worker-runner/run"
)

func TestCredsExpiration(t *testing.T) {
	state := &run.State{
		// message is sent 30 seconds before expiration, so set expiration
		// for 30s from now
		CredentialsExpire: time.Now().Add(30 * time.Second),
	}

	ce := New(state)

	transp := protocol.NewFakeTransport()
	defer transp.Close()
	transp.InjectMessage(protocol.Message{
		Type: "hello",
		Properties: map[string]interface{}{
			"capabilities": []interface{}{"graceful-termination"},
		},
	})
	proto := protocol.NewProtocol(transp)
	proto.AddCapability("graceful-termination")
	proto.Start(false)

	ce.SetProtocol(proto)

	err := ce.WorkerStarted()
	assert.NoError(t, err)

	// wait until the protocol negotiation happens and the graceful termination
	// message is sent
	for {
		time.Sleep(10 * time.Millisecond)
		if len(transp.Messages()) >= 2 {
			break
		}
	}

	assert.Equal(t, []protocol.Message{
		protocol.Message{
			Type: "welcome",
			Properties: map[string]interface{}{
				"capabilities": []string{"graceful-termination"},
			},
		},
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
