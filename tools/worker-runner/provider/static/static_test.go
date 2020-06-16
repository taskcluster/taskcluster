package static

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/tc"
)

func TestConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	require.NoError(t, err, "setting config")
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
				"workerLocation": map[string]interface{}{
					"region": "underworld",
					"zone":   "666",
				},
				"providerMetadata": map[string]interface{}{
					"temperature": "24",
				},
			},
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}

	p, err := new(runnercfg, tc.FakeWorkerManagerClientFactory)
	require.NoError(t, err, "creating provider")

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	require.NoError(t, err)

	reg, err := tc.FakeWorkerManagerRegistration()
	require.NoError(t, err)
	require.Equal(t, "static-1", reg.ProviderID)
	require.Equal(t, "wg", reg.WorkerGroup)
	require.Equal(t, "wi", reg.WorkerID)
	require.Equal(t, json.RawMessage(`{"staticSecret":"quiet"}`), reg.WorkerIdentityProof)
	require.Equal(t, "w/p", reg.WorkerPoolID)

	require.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	require.Equal(t, "testing", state.Credentials.ClientID, "clientID is correct")
	require.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	require.Equal(t, "cert", state.Credentials.Certificate, "cert is correct")
	require.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	require.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	require.Equal(t, "wi", state.WorkerID, "workerID is correct")
	require.Equal(t, map[string]interface{}{"temperature": "24"}, state.ProviderMetadata, "providerMetadata is correct")

	require.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	require.Equal(t, "static", state.WorkerLocation["cloud"])
	require.Equal(t, "underworld", state.WorkerLocation["region"])
	require.Equal(t, "666", state.WorkerLocation["zone"])
}
