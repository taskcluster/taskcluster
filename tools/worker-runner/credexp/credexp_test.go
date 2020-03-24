package credexp

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster/v28/tools/worker-runner/protocol"
	ptesting "github.com/taskcluster/taskcluster/v28/tools/worker-runner/protocol/testing"
	"github.com/taskcluster/taskcluster/v28/tools/worker-runner/run"
)

func TestCredsExpiration(t *testing.T) {
	state := &run.State{
		// message is sent 30 seconds before expiration, so set expiration
		// for 30s from now
		CredentialsExpire: time.Now().Add(30 * time.Second),
	}

	ce := New(state)

	wkr := ptesting.NewFakeWorkerWithCapabilities("graceful-termination")
	defer wkr.Close()

	gotTerminated := wkr.MessageReceivedFunc("graceful-termination", func(msg protocol.Message) bool {
		return msg.Properties["finish-tasks"].(bool) == false
	})

	ce.SetProtocol(wkr.RunnerProtocol)

	err := ce.WorkerStarted()
	wkr.RunnerProtocol.Start(false)
	assert.NoError(t, err)

	// wait until the protocol negotiation happens and the graceful termination
	// message is sent
	for {
		time.Sleep(10 * time.Millisecond)
		if gotTerminated() {
			break
		}
	}

	err = ce.WorkerFinished()
	assert.NoError(t, err)
}
