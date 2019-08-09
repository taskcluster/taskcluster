package standalone

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/run"
)

func TestConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	assert.NoError(t, err, "setting config")
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "standalone",
			Data: map[string]interface{}{
				"rootURL":      "https://tc.example.com",
				"clientID":     "testing",
				"accessToken":  "at",
				"workerPoolID": "w/p",
				"workerGroup":  "wg",
				"workerID":     "wi",
			},
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}

	p, err := New(runnercfg)
	assert.NoError(t, err, "creating provider")

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	if !assert.NoError(t, err, "ConfigureRun") {
		return
	}

	assert.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	assert.Equal(t, "testing", state.Credentials.ClientID, "clientID is correct")
	assert.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	assert.Equal(t, "", state.Credentials.Certificate, "cert is correct")
	assert.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	assert.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	assert.Equal(t, "wi", state.WorkerID, "workerID is correct")
	assert.Equal(t, map[string]string{}, state.ProviderMetadata, "providerMetadata is correct")

	assert.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
}
