package registration

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	tcclient "github.com/taskcluster/taskcluster/v30/clients/client-go"
	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
	ptesting "github.com/taskcluster/taskcluster/v30/internal/workerproto/testing"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/tc"
)

func TestRegisterWorker(t *testing.T) {
	state := run.State{
		WorkerPoolID: "wp/id",
		ProviderID:   "prov",
		WorkerGroup:  "wg",
		WorkerID:     "wid",
	}
	runnercfg := cfg.RunnerConfig{}
	runnercfg.WorkerImplementation.Implementation = "whatever-worker"
	reg := new(&runnercfg, &state, tc.FakeWorkerManagerClientFactory)

	proof := map[string]interface{}{
		"because": "I said so",
	}

	expires := tcclient.Time(time.Now())
	tc.SetFakeWorkerManagerWorkerExpires(expires)

	err := reg.RegisterWorker(proof)
	require.NoError(t, err)

	require.Equal(t, "testing", state.Credentials.ClientID)
	require.Equal(t, "at", state.Credentials.AccessToken)
	require.Equal(t, "cert", state.Credentials.Certificate)
	require.Equal(t, time.Time(expires), state.CredentialsExpire)

	require.Equal(t, true, state.WorkerConfig.MustGet("from-register-worker"), "value for from-register-worker")
	require.Equal(t, "a file.", state.Files[0].Description)

	call, err := tc.FakeWorkerManagerRegistration()
	require.NoError(t, err)
	require.Equal(t, "wp/id", call.WorkerPoolID)
	require.Equal(t, "prov", call.ProviderID)
	require.Equal(t, "wg", call.WorkerGroup)
	require.Equal(t, "wid", call.WorkerID)
	require.Equal(t, json.RawMessage([]byte(`{"because":"I said so"}`)), call.WorkerIdentityProof)
}

func TestCredsExpiration(t *testing.T) {
	runnercfg := cfg.RunnerConfig{}
	state := run.State{
		// message is sent 30 seconds before expiration, so set expiration
		// for 30s from now
		CredentialsExpire: time.Now().Add(30 * time.Second),
	}

	reg := new(&runnercfg, &state, tc.FakeWorkerManagerClientFactory)

	wkr := ptesting.NewFakeWorkerWithCapabilities("graceful-termination")
	defer wkr.Close()

	gotTerminated := wkr.MessageReceivedFunc("graceful-termination", func(msg workerproto.Message) bool {
		return msg.Properties["finish-tasks"].(bool) == false
	})

	reg.SetProtocol(wkr.RunnerProtocol)

	err := reg.WorkerStarted()
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

	err = reg.WorkerFinished()
	assert.NoError(t, err)
}
