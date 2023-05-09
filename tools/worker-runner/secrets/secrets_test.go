package secrets

import (
	"testing"

	"github.com/stretchr/testify/assert"
	tcclient "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/clients/client-go/tcsecrets"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/tc"
)

func setup(t *testing.T) (*cfg.RunnerConfig, *run.State) {
	tc.FakeSecretsReset()

	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-secret", false) // overridden
	assert.NoError(t, err, "setting config")
	runnerWorkerConfig, err = runnerWorkerConfig.Set("from-runner-cfg", true)
	assert.NoError(t, err, "setting config")
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "dummy",
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}
	state := &run.State{
		RootURL:      "https://tc.example.com",
		Credentials:  tcclient.Credentials{ClientID: "cli"},
		WorkerPoolID: "pp/wt",
		WorkerConfig: runnercfg.WorkerConfig,
	}
	return runnercfg, state
}

func TestGetSecretLegacyFormat(t *testing.T) {
	runnercfg, state := setup(t)

	tc.FakeSecretsCreateSecret("worker-pool:pp/wt", &tcsecrets.Secret{
		Secret: []byte(`{"from-secret": true}`),
	})

	err := configureRun(runnercfg, state, tc.FakeSecretsClientFactory)
	assert.NoError(t, err, "expected great success")
	assert.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	assert.Equal(t, true, state.WorkerConfig.MustGet("from-secret"), "value for from-secret")
}

func TestGetSecretLegacyInsuffScopes(t *testing.T) {
	runnercfg, state := setup(t)

	tc.FakeSecretsCreateSecret("worker-type:pp/wt", nil) // meaning 403

	err := configureRun(runnercfg, state, tc.FakeSecretsClientFactory)
	assert.NoError(t, err, "expected great success")
	assert.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	assert.Equal(t, false, state.WorkerConfig.MustGet("from-secret"), "value for from-secret")
}

func TestGetSecretLegacyName(t *testing.T) {
	runnercfg, state := setup(t)

	tc.FakeSecretsCreateSecret("worker-type:pp/wt", &tcsecrets.Secret{
		Secret: []byte(`{"config": {"from-secret": true}}`),
	})

	err := configureRun(runnercfg, state, tc.FakeSecretsClientFactory)
	assert.NoError(t, err, "expected great success")
	assert.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	assert.Equal(t, true, state.WorkerConfig.MustGet("from-secret"), "value for from-secret")
}

func TestGetSecretConfigFilesFormat(t *testing.T) {
	runnercfg, state := setup(t)

	tc.FakeSecretsCreateSecret("worker-pool:pp/wt", &tcsecrets.Secret{
		Secret: []byte(`{"config": {"from-secret": true}}`),
	})

	err := configureRun(runnercfg, state, tc.FakeSecretsClientFactory)
	assert.NoError(t, err, "expected great success")
	assert.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	assert.Equal(t, true, state.WorkerConfig.MustGet("from-secret"), "value for from-secret")
}

func TestGetSecretNotFound(t *testing.T) {
	runnercfg, state := setup(t)

	err := configureRun(runnercfg, state, tc.FakeSecretsClientFactory)
	assert.NoError(t, err, "expected great success")
	assert.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	assert.Equal(t, false, state.WorkerConfig.MustGet("from-secret"), "value for from-secret (not found)")
}
