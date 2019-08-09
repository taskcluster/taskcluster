package google

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
)

func TestGoogleConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	assert.NoError(t, err, "setting config")
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "google",
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}

	userData := &UserData{
		WorkerPoolID: "w/p",
		ProviderID:   "gcp1",
		WorkerGroup:  "wg",
		RootURL:      "https://tc.example.com",
	}
	identityPath := "/instance/service-accounts/default/identity?audience=https://tc.example.com&format=full"
	metaData := map[string]string{
		"/instance/id":           "i-123",
		identityPath:             "i-promise",
		"/project/project-id":    "proj-1234",
		"/instance/image":        "img-123",
		"/instance/machine-type": "most-of-the-cloud",
		"/instance/zone":         "/project/1234/zone/in-central-1b",
		"/instance/hostname":     "my-worker.example.com",
		"/instance/network-interfaces/0/access-configs/0/external-ip": "1.2.3.4",
		"/instance/network-interfaces/0/ip":                           "192.168.0.1",
	}
	mds := &fakeMetadataService{nil, userData, metaData}

	p, err := new(runnercfg, tc.FakeWorkerManagerClientFactory, mds)
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
		assert.Equal(t, userData.ProviderID, reg.ProviderID)
		assert.Equal(t, userData.WorkerGroup, reg.WorkerGroup)
		assert.Equal(t, "i-123", reg.WorkerID)
		assert.Equal(t, json.RawMessage(`{"token":"i-promise"}`), reg.WorkerIdentityProof)
		assert.Equal(t, "w/p", reg.WorkerPoolID)
	}

	assert.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	assert.Equal(t, "testing", state.Credentials.ClientID, "clientID is correct")
	assert.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	assert.Equal(t, "cert", state.Credentials.Certificate, "cert is correct")
	assert.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	assert.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	assert.Equal(t, "i-123", state.WorkerID, "workerID is correct")

	assert.Equal(t, map[string]string{
		"project-id":      "proj-1234",
		"image":           "img-123",
		"instance-type":   "most-of-the-cloud",
		"instance-id":     "i-123",
		"zone":            "in-central-1b",
		"region":          "in-central-1",
		"public-ipv4":     "1.2.3.4",
		"public-hostname": "my-worker.example.com",
		"local-ipv4":      "192.168.0.1",
	}, state.ProviderMetadata, "providerMetadata is correct")

	assert.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
}
