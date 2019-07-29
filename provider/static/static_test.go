package static

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
)

func TestConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	assert.NoError(t, err, "setting config")
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "static",
			Data: map[string]interface{}{
				"rootURL":      "https://tc.example.com",
				"providerID":   "static-1",
				"workerPoolID": "w/p",
				"workerGroup":  "wg",
				"workerID":     "wi",
				"staticSecret": "quiet",
			},
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}

	p, err := new(runnercfg, tc.FakeWorkerManagerClientFactory)
	assert.NoError(t, err, "creating provider")

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	if !assert.NoError(t, err, "ConfigureRun") {
		return
	}

	reg, err := tc.FakeWorkerManagerRegistration()
	if assert.NoError(t, err) {
		assert.Equal(t, "static-1", reg.ProviderID)
		assert.Equal(t, "wg", reg.WorkerGroup)
		assert.Equal(t, "wi", reg.WorkerID)
		assert.Equal(t, json.RawMessage(`{"staticSecret":"quiet"}`), reg.WorkerIdentityProof)
		assert.Equal(t, "w/p", reg.WorkerPoolID)
	}

	assert.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	assert.Equal(t, "testing", state.Credentials.ClientID, "clientID is correct")
	assert.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	assert.Equal(t, "cert", state.Credentials.Certificate, "cert is correct")
	assert.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	assert.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	assert.Equal(t, "wi", state.WorkerID, "workerID is correct")
	assert.Equal(t, map[string]string{}, state.ProviderMetadata, "providerMetadata is correct")

	assert.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
}
