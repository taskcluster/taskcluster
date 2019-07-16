package secrets

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v14"
	"github.com/taskcluster/taskcluster/clients/client-go/v14/tcsecrets"
)

func setup(t *testing.T) (*runner.RunnerConfig, *runner.Run) {
	tc.FakeSecretsReset()

	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-secret", false) // overridden
	assert.NoError(t, err, "setting config")
	runnerWorkerConfig, err = runnerWorkerConfig.Set("from-runner-cfg", true)
	assert.NoError(t, err, "setting config")
	runnercfg := &runner.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "dummy",
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}
	run := &runner.Run{
		RootURL:      "https://tc.example.com",
		Credentials:  tcclient.Credentials{ClientID: "cli"},
		WorkerPoolID: "pp/wt",
		WorkerConfig: runnercfg.WorkerConfig,
	}
	return runnercfg, run
}

func TestGetSecretLegacyFormat(t *testing.T) {
	runnercfg, run := setup(t)

	tc.FakeSecretsCreateSecret("worker-pool:pp/wt", &tcsecrets.Secret{
		Secret: []byte(`{"from-secret": true}`),
	})

	err := configureRun(runnercfg, run, tc.FakeSecretsClientFactory)
	assert.NoError(t, err, "expected great success")
	assert.Equal(t, true, run.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	assert.Equal(t, true, run.WorkerConfig.MustGet("from-secret"), "value for from-secret")
}

func TestGetSecretLegacyInsuffScopes(t *testing.T) {
	runnercfg, run := setup(t)

	tc.FakeSecretsCreateSecret("worker-type:pp/wt", nil) // meaning 403

	err := configureRun(runnercfg, run, tc.FakeSecretsClientFactory)
	assert.NoError(t, err, "expected great success")
	assert.Equal(t, true, run.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	assert.Equal(t, false, run.WorkerConfig.MustGet("from-secret"), "value for from-secret")
}

func TestGetSecretLegacyName(t *testing.T) {
	runnercfg, run := setup(t)

	tc.FakeSecretsCreateSecret("worker-type:pp/wt", &tcsecrets.Secret{
		Secret: []byte(`{"config": {"from-secret": true}}`),
	})

	err := configureRun(runnercfg, run, tc.FakeSecretsClientFactory)
	assert.NoError(t, err, "expected great success")
	assert.Equal(t, true, run.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	assert.Equal(t, true, run.WorkerConfig.MustGet("from-secret"), "value for from-secret")
}

func TestGetSecretConfigFilesFormat(t *testing.T) {
	runnercfg, run := setup(t)

	tc.FakeSecretsCreateSecret("worker-pool:pp/wt", &tcsecrets.Secret{
		Secret: []byte(`{"config": {"from-secret": true}}`),
	})

	err := configureRun(runnercfg, run, tc.FakeSecretsClientFactory)
	assert.NoError(t, err, "expected great success")
	assert.Equal(t, true, run.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	assert.Equal(t, true, run.WorkerConfig.MustGet("from-secret"), "value for from-secret")
}

func TestGetSecretNotFound(t *testing.T) {
	runnercfg, run := setup(t)

	err := configureRun(runnercfg, run, tc.FakeSecretsClientFactory)
	assert.NoError(t, err, "expected great success")
	assert.Equal(t, true, run.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	assert.Equal(t, false, run.WorkerConfig.MustGet("from-secret"), "value for from-secret (not found)")
}
