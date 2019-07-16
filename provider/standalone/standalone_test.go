package standalone

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
)

func TestConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	assert.NoError(t, err, "setting config")
	runnercfg := &runner.RunnerConfig{
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

	run := runner.Run{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&run)
	if !assert.NoError(t, err, "ConfigureRun") {
		return
	}

	assert.Equal(t, "https://tc.example.com", run.RootURL, "rootURL is correct")
	assert.Equal(t, "testing", run.Credentials.ClientID, "clientID is correct")
	assert.Equal(t, "at", run.Credentials.AccessToken, "accessToken is correct")
	assert.Equal(t, "", run.Credentials.Certificate, "cert is correct")
	assert.Equal(t, "w/p", run.WorkerPoolID, "workerPoolID is correct")
	assert.Equal(t, "wg", run.WorkerGroup, "workerGroup is correct")
	assert.Equal(t, "wi", run.WorkerID, "workerID is correct")
	assert.Equal(t, map[string]string{}, run.ProviderMetadata, "providerMetadata is correct")

	assert.Equal(t, true, run.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
}
