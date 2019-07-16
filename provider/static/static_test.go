package static

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v14"
)

func TestConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	assert.NoError(t, err, "setting config")
	runnercfg := &runner.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "static",
			Data: map[string]interface{}{
				"rootURL":        "https://tc.example.com",
				"providerID":     "static-1",
				"workerPoolID":   "w/p",
				"workerGroup":    "wg",
				"workerID":       "wi",
				"identitySecret": "quiet",
			},
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}

	p, err := new(runnercfg, tc.FakeWorkerManagerClientFactory)
	assert.NoError(t, err, "creating provider")

	run := runner.Run{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&run)
	if !assert.NoError(t, err, "ConfigureRun") {
		return
	}

	reg, err := tc.FakeWorkerManagerRegistration()
	if assert.NoError(t, err) {
		assert.Equal(t, "static-1", reg.ProviderID)
		assert.Equal(t, "wg", reg.WorkerGroup)
		assert.Equal(t, "wi", reg.WorkerID)
		assert.Equal(t, json.RawMessage(`{"secret":"quiet"}`), reg.WorkerIdentityProof)
		assert.Equal(t, "w/p", reg.WorkerPoolID)
	}

	assert.Equal(t, "https://tc.example.com", run.RootURL, "rootURL is correct")
	assert.Equal(t, "testing", run.Credentials.ClientID, "clientID is correct")
	assert.Equal(t, "at", run.Credentials.AccessToken, "accessToken is correct")
	assert.Equal(t, "cert", run.Credentials.Certificate, "cert is correct")
	assert.Equal(t, "w/p", run.WorkerPoolID, "workerPoolID is correct")
	assert.Equal(t, "wg", run.WorkerGroup, "workerGroup is correct")
	assert.Equal(t, "wi", run.WorkerID, "workerID is correct")
	assert.Equal(t, map[string]string{}, run.ProviderMetadata, "providerMetadata is correct")

	assert.Equal(t, true, run.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
}

func TestCredsExpiration(t *testing.T) {
	runnercfg := &runner.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "static",
			Data: map[string]interface{}{
				"rootURL":        "https://tc.example.com",
				"providerID":     "static-1",
				"workerPoolID":   "w/p",
				"workerGroup":    "wg",
				"workerID":       "wi",
				"identitySecret": "quiet",
			},
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: cfg.NewWorkerConfig(),
	}

	p, err := new(runnercfg, tc.FakeWorkerManagerClientFactory)
	assert.NoError(t, err, "creating provider")

	transp := protocol.NewFakeTransport()
	p.proto = protocol.NewProtocol(transp)
	p.proto.Capabilities.Add("graceful-termination")

	// send the shutdown message right now
	p.credsExpire = tcclient.Time(time.Now().Add(30 * time.Second))
	err = p.WorkerStarted()
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

	err = p.WorkerFinished()
	assert.NoError(t, err)
}
