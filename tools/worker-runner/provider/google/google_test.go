package google

import (
	"encoding/json"
	"testing"

	ptesting "github.com/taskcluster/taskcluster/v30/internal/workerproto/testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/tc"
)

func TestGoogleConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	require.NoError(t, err, "setting config")
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "google",
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever-worker",
		},
		WorkerConfig: runnerWorkerConfig,
	}

	pwcJson := json.RawMessage(`{
        "whateverWorker": {
		    "config": {
				"from-ud": true
			},
			"files": [
			    {"description": "a file."}
			]
		}
	}`)
	userData := &UserData{
		WorkerPoolID:         "w/p",
		ProviderID:           "gcp1",
		WorkerGroup:          "wg",
		RootURL:              "https://tc.example.com",
		ProviderWorkerConfig: &pwcJson,
	}
	identityPath := "/instance/service-accounts/default/identity?audience=https://tc.example.com&format=full"
	metaData := map[string]string{
		"/instance/id":           "i-123",
		identityPath:             "i-promise",
		"/project/project-id":    "proj-1234",
		"/instance/image":        "img-123",
		"/instance/machine-type": "most-of-the-cloud",
		"/instance/zone":         "/project/1234/zone/in-central1-b",
		"/instance/hostname":     "my-worker.example.com",
		"/instance/network-interfaces/0/access-configs/0/external-ip": "1.2.3.4",
		"/instance/network-interfaces/0/ip":                           "192.168.0.1",
	}
	mds := &fakeMetadataService{nil, userData, metaData}

	p, err := new(runnercfg, tc.FakeWorkerManagerClientFactory, mds)
	require.NoError(t, err, "creating provider")

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	require.NoError(t, err, "ConfigureRun")

	reg, err := tc.FakeWorkerManagerRegistration()
	if assert.NoError(t, err) {
		require.Equal(t, userData.ProviderID, reg.ProviderID)
		require.Equal(t, userData.WorkerGroup, reg.WorkerGroup)
		require.Equal(t, "i-123", reg.WorkerID)
		require.Equal(t, json.RawMessage(`{"token":"i-promise"}`), reg.WorkerIdentityProof)
		require.Equal(t, "w/p", reg.WorkerPoolID)
	}

	require.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	require.Equal(t, "testing", state.Credentials.ClientID, "clientID is correct")
	require.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	require.Equal(t, "cert", state.Credentials.Certificate, "cert is correct")
	require.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	require.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	require.Equal(t, "i-123", state.WorkerID, "workerID is correct")

	require.Equal(t, map[string]interface{}{
		"project-id":      "proj-1234",
		"image":           "img-123",
		"instance-type":   "most-of-the-cloud",
		"instance-id":     "i-123",
		"zone":            "in-central1-b",
		"region":          "in-central1",
		"public-ipv4":     "1.2.3.4",
		"public-hostname": "my-worker.example.com",
		"local-ipv4":      "192.168.0.1",
	}, state.ProviderMetadata, "providerMetadata is correct")

	require.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	require.Equal(t, true, state.WorkerConfig.MustGet("from-register-worker"), "value for from-register-worker")
	require.Equal(t, false, state.WorkerConfig.Has("from-ud"), "userdata worker-config ignored")
	require.Equal(t, "a file.", state.Files[0].Description)

	require.Equal(t, "google", state.WorkerLocation["cloud"])
	require.Equal(t, "in-central1", state.WorkerLocation["region"])
	require.Equal(t, "in-central1-b", state.WorkerLocation["zone"])

	wkr := ptesting.NewFakeWorkerWithCapabilities("shutdown")
	defer wkr.Close()

	p.SetProtocol(wkr.RunnerProtocol)
	require.NoError(t, p.WorkerStarted(&state))
	wkr.RunnerProtocol.Start(false)
	wkr.RunnerProtocol.WaitUntilInitialized()
	require.True(t, wkr.RunnerProtocol.Capable("shutdown"))
}
