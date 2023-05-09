package standalone

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
)

func TestConfigureRunNoOptional(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	require.NoError(t, err, "setting config")
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
	require.NoError(t, err, "creating provider")

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	require.NoError(t, err)

	require.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	require.Equal(t, "testing", state.Credentials.ClientID, "clientID is correct")
	require.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	require.Equal(t, "", state.Credentials.Certificate, "cert is correct")
	require.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	require.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	require.Equal(t, "wi", state.WorkerID, "workerID is correct")
	require.Equal(t, map[string]interface{}{}, state.ProviderMetadata, "providerMetadata is correct")

	require.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	require.Equal(t, "standalone", state.WorkerLocation["cloud"])
	require.Equal(t, 1, len(state.WorkerLocation))
}

func TestConfigureRunAllOptional(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	require.NoError(t, err, "setting config")
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
				"workerLocation": map[string]interface{}{
					"region": "underworld",
					"zone":   "666",
				},
				"providerMetadata": map[string]interface{}{
					"public-ip": "1.2.3.4",
					"secret-ip": "0.0.0.0",
				},
			},
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}

	p, err := New(runnercfg)
	require.NoError(t, err, "creating provider")

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	require.NoError(t, err)

	require.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	require.Equal(t, "testing", state.Credentials.ClientID, "clientID is correct")
	require.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	require.Equal(t, "", state.Credentials.Certificate, "cert is correct")
	require.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	require.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	require.Equal(t, "wi", state.WorkerID, "workerID is correct")

	require.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	require.Equal(t, "standalone", state.WorkerLocation["cloud"])
	require.Equal(t, "underworld", state.WorkerLocation["region"])
	require.Equal(t, "666", state.WorkerLocation["zone"])
	require.Equal(t, "1.2.3.4", state.ProviderMetadata["public-ip"])
	require.Equal(t, "0.0.0.0", state.ProviderMetadata["secret-ip"])
	require.Equal(t, 2, len(state.ProviderMetadata))

	proof, err := p.GetWorkerIdentityProof()
	require.NoError(t, err)
	require.Nil(t, proof)
}

func TestConfigureRunNonStringLocation(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	require.NoError(t, err, "setting config")
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
				"workerLocation": map[string]interface{}{
					"region": 13,
				},
			},
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}

	p, err := New(runnercfg)
	require.NoError(t, err, "creating provider")

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	if assert.Error(t, err) {
		require.Equal(t, fmt.Errorf("workerLocation value region is not a string"), err)
	}
}
