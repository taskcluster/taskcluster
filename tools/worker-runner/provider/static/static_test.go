package static

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v93/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v93/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v93/tools/worker-runner/tc"
)

func TestConfigureRun(t *testing.T) {
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "static",
			Data: map[string]any{
				"rootURL":      "https://tc.example.com",
				"providerID":   "static-1",
				"workerPoolID": "w/p",
				"workerGroup":  "wg",
				"workerID":     "wi",
				"staticSecret": "quiet",
				"workerLocation": map[string]any{
					"region": "underworld",
					"zone":   "666",
				},
				"providerMetadata": map[string]any{
					"temperature": "24",
				},
			},
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
	}

	p, err := new(runnercfg, tc.FakeWorkerManagerClientFactory)
	require.NoError(t, err, "creating provider")

	state := run.State{}
	err = p.ConfigureRun(&state)
	require.NoError(t, err)

	require.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	require.Equal(t, "static-1", state.ProviderID, "providerID is correct")
	require.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	require.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	require.Equal(t, "wi", state.WorkerID, "workerID is correct")
	require.Equal(t, map[string]any{"temperature": "24"}, state.ProviderMetadata, "providerMetadata is correct")

	require.Equal(t, "static", state.WorkerLocation["cloud"])
	require.Equal(t, "underworld", state.WorkerLocation["region"])
	require.Equal(t, "666", state.WorkerLocation["zone"])

	proof, err := p.GetWorkerIdentityProof()
	require.NoError(t, err)
	require.Equal(t, map[string]any{
		"staticSecret": "quiet",
	}, proof)
}

func TestUseCachedRun(t *testing.T) {
	runnercfg := &cfg.RunnerConfig{}

	p, err := new(runnercfg, tc.FakeWorkerManagerClientFactory)
	require.NoError(t, err, "creating provider")

	// UseCachedRun should unconditionally return an error
	err = p.UseCachedRun(&run.State{})
	require.Error(t, err)
}
