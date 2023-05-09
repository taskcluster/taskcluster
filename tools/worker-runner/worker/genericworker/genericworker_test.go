package genericworker

import (
	"testing"

	"github.com/stretchr/testify/require"
	taskcluster "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
)

func CallConfigureRun(t *testing.T, state *run.State) {
	runnercfg := &cfg.RunnerConfig{
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "generic-worker",
			Data: map[string]interface{}{
				"configPath": "/no/such/path",
			},
		},
	}

	gw, err := New(runnercfg)
	require.NoError(t, err)

	err = gw.ConfigureRun(state)
	require.NoError(t, err)
}

func TestConfigureRunWithProviderMetadataConfig(t *testing.T) {
	wc, err := cfg.NewWorkerConfig().Set(
		"workerTypeMetadata",
		map[string]interface{}{
			"from-worker-pool": "yup",
		},
	)
	require.NoError(t, err)

	state := &run.State{
		WorkerConfig: wc,
		RootURL:      "ru",
		Credentials: taskcluster.Credentials{
			ClientID:    "ci",
			AccessToken: "at",
			Certificate: "cert",
		},
		WorkerPoolID: "prov/wt",
		WorkerGroup:  "wg",
		WorkerID:     "wi",
		ProviderMetadata: map[string]interface{}{
			"public-ipv4":       "1.2.3.4",
			"local-ipv4":        "10.1.1.1",
			"availability-zone": "mars",
			"region":            "sol",
			"instance-type":     "13xlarge",
			"instance-id":       "1234",
		},
	}

	CallConfigureRun(t, state)

	require.Equal(t, "1.2.3.4", state.WorkerConfig.MustGet("publicIP"))
	require.Equal(t, "10.1.1.1", state.WorkerConfig.MustGet("privateIP"))
	require.Equal(t, "mars", state.WorkerConfig.MustGet("availabilityZone"))
	require.Equal(t, "sol", state.WorkerConfig.MustGet("region"))
	require.Equal(t, "13xlarge", state.WorkerConfig.MustGet("instanceType"))
	require.Equal(t, "1234", state.WorkerConfig.MustGet("instanceID"))
	require.Equal(t, "ru", state.WorkerConfig.MustGet("rootURL"))
	require.Equal(t, "ci", state.WorkerConfig.MustGet("clientId"))
	require.Equal(t, "at", state.WorkerConfig.MustGet("accessToken"))
	require.Equal(t, "prov", state.WorkerConfig.MustGet("provisionerId"))
	require.Equal(t, "wt", state.WorkerConfig.MustGet("workerType"))
	require.Equal(t, "wg", state.WorkerConfig.MustGet("workerGroup"))
	require.Equal(t, "wi", state.WorkerConfig.MustGet("workerId"))
	require.Equal(t, "cert", state.WorkerConfig.MustGet("certificate"))
	require.Equal(t, map[string]interface{}{
		"public-ipv4":       "1.2.3.4",
		"local-ipv4":        "10.1.1.1",
		"availability-zone": "mars",
		"region":            "sol",
		"instance-type":     "13xlarge",
		"instance-id":       "1234",
		"from-worker-pool":  "yup",
	}, state.WorkerConfig.MustGet("workerTypeMetadata"))
}

func TestConfigureRunWithoutProviderMetadataConfig(t *testing.T) {
	state := &run.State{
		WorkerConfig: cfg.NewWorkerConfig(),
		RootURL:      "ru",
		Credentials: taskcluster.Credentials{
			ClientID:    "ci",
			AccessToken: "at",
			Certificate: "cert",
		},
		WorkerPoolID:     "prov/wt",
		WorkerGroup:      "wg",
		WorkerID:         "wi",
		ProviderMetadata: map[string]interface{}{},
	}

	CallConfigureRun(t, state)

	require.False(t, state.WorkerConfig.Has("publicIP"))
	require.False(t, state.WorkerConfig.Has("privateIP"))
	require.False(t, state.WorkerConfig.Has("availabilityZone"))
	require.False(t, state.WorkerConfig.Has("region"))
	require.False(t, state.WorkerConfig.Has("instanceType"))
	require.False(t, state.WorkerConfig.Has("instanceID"))
	require.Equal(t, "ru", state.WorkerConfig.MustGet("rootURL"))
	require.Equal(t, "ci", state.WorkerConfig.MustGet("clientId"))
	require.Equal(t, "at", state.WorkerConfig.MustGet("accessToken"))
	require.Equal(t, "prov", state.WorkerConfig.MustGet("provisionerId"))
	require.Equal(t, "wt", state.WorkerConfig.MustGet("workerType"))
	require.Equal(t, "wg", state.WorkerConfig.MustGet("workerGroup"))
	require.Equal(t, "wi", state.WorkerConfig.MustGet("workerId"))
	require.Equal(t, "cert", state.WorkerConfig.MustGet("certificate"))
	require.Equal(t, map[string]interface{}{}, state.WorkerConfig.MustGet("workerTypeMetadata"))
}
