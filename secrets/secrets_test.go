package secrets

import (
	"testing"

	"github.com/stretchr/testify/assert"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcsecrets"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
)

func setup(t *testing.T) (*cfg.RunnerConfig, *runner.Run) {
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
	run := &runner.Run{
		RootURL:      "https://tc.example.com",
		Credentials:  tcclient.Credentials{ClientID: "cli"},
		WorkerPoolID: "pp/wt",
		WorkerConfig: runnercfg.WorkerConfig,
	}
	return runnercfg, run
}

func TestGetSecretLegacy(t *testing.T) {
	runnercfg, run := setup(t)

	tc.FakeSecretsCreateSecret("worker-type:pp/wt", &tcsecrets.Secret{
		Secret: []byte(`{"from-secret": true}`),
	})

	err := configureRun(runnercfg, run, tc.FakeSecretsClientFactory)
	assert.NoError(t, err, "expected great success")
	assert.Equal(t, true, run.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	assert.Equal(t, true, run.WorkerConfig.MustGet("from-secret"), "value for from-secret")
}

func TestGetSecretConfigFilesFormat(t *testing.T) {
	runnercfg, run := setup(t)

	tc.FakeSecretsCreateSecret("worker-type:pp/wt", &tcsecrets.Secret{
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
