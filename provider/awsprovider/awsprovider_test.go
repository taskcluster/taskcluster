package awsprovider

import (
	"encoding/json"
	"testing"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	"github.com/taskcluster/taskcluster-worker-runner/run"
)

func TestAWSConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	assert.NoError(t, err, "setting config")
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "aws",
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}

	userData := &UserData{
		WorkerPoolId: "w/p",
		ProviderId:   "amazon",
		WorkerGroup:  "wg",
		RootURL:      "https://tc.example.com",
	}

	metaData := map[string]string{
		"/dynamic/instance-identity/signature": "thisisasignature",
		"/meta-data/public-hostname": "hostname",
		"/meta-data/public-ipv4": "2.2.2.2",
	}

	instanceIdentityDocument := "{\n  \"instanceId\" : \"i-55555nonesense5\",\n  \"region\" : \"us-west-2\",\n  \"availabilityZone\" : \"us-west-2a\",\n  \"instanceType\" : \"t2.micro\",\n  \"imageId\" : \"banana\"\n,  \"privateIp\" : \"1.1.1.1\"\n}"


	mds := &fakeMetadataService{nil, userData, metaData, instanceIdentityDocument}

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
		assert.Equal(t, userData.ProviderId, reg.ProviderID)
		assert.Equal(t, userData.WorkerGroup, reg.WorkerGroup)
		assert.Equal(t, "i-55555nonesense5", reg.WorkerID)
		assert.Equal(t, json.RawMessage(`{"document":"{\n  \"instanceId\" : \"i-55555nonesense5\",\n  \"region\" : \"us-west-2\",\n  \"availabilityZone\" : \"us-west-2a\",\n  \"instanceType\" : \"t2.micro\",\n  \"imageId\" : \"banana\"\n,  \"privateIp\" : \"1.1.1.1\"\n}","signature":"thisisasignature"}`), reg.WorkerIdentityProof)
		assert.Equal(t, "w/p", reg.WorkerPoolID)
	}

	assert.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	assert.Equal(t, "testing", state.Credentials.ClientID, "clientID is correct")
	assert.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	assert.Equal(t, "cert", state.Credentials.Certificate, "cert is correct")
	assert.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	assert.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	assert.Equal(t, "i-55555nonesense5", state.WorkerID, "workerID is correct")

	assert.Equal(t, map[string]string{
		"instance-id": "i-55555nonesense5",
		"image": "banana",
		"instance-type": "t2.micro",
		"availability-zone": "us-west-2a",
		"region": "us-west-2",
		"local-ipv4": "1.1.1.1",
		"public-hostname": "hostname",
		"public-ipv4": "2.2.2.2",
	}, state.ProviderMetadata, "providerMetadata is correct")

	assert.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
}
