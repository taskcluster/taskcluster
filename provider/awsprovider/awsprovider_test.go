package awsprovider

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
)

func TestAWSConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	require.NoError(t, err, "setting config")
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "aws",
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}

	userDataWorkerConfig := cfg.NewWorkerConfig()
	userDataWorkerConfig, err = userDataWorkerConfig.Set("from-ud", true)
	require.NoError(t, err, "setting config")

	userData := &UserData{
		WorkerPoolId: "w/p",
		ProviderId:   "amazon",
		WorkerGroup:  "wg",
		RootURL:      "https://tc.example.com",
		WorkerConfig: userDataWorkerConfig,
	}

	metaData := map[string]string{
		"/dynamic/instance-identity/signature": "thisisasignature",
		"/meta-data/public-hostname":           "hostname",
		"/meta-data/public-ipv4":               "2.2.2.2",
	}

	instanceIdentityDocument := "{\n  \"instanceId\" : \"i-55555nonesense5\",\n  \"region\" : \"us-west-2\",\n  \"availabilityZone\" : \"us-west-2a\",\n  \"instanceType\" : \"t2.micro\",\n  \"imageId\" : \"banana\"\n,  \"privateIp\" : \"1.1.1.1\"\n}"

	mds := &fakeMetadataService{nil, userData, metaData, instanceIdentityDocument}

	p, err := new(runnercfg, tc.FakeWorkerManagerClientFactory, mds)
	require.NoError(t, err, "creating provider")

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	require.NoError(t, err)

	reg, err := tc.FakeWorkerManagerRegistration()
	require.NoError(t, err)
	require.Equal(t, userData.ProviderId, reg.ProviderID)
	require.Equal(t, userData.WorkerGroup, reg.WorkerGroup)
	require.Equal(t, "i-55555nonesense5", reg.WorkerID)
	require.Equal(t, json.RawMessage(`{"document":"{\n  \"instanceId\" : \"i-55555nonesense5\",\n  \"region\" : \"us-west-2\",\n  \"availabilityZone\" : \"us-west-2a\",\n  \"instanceType\" : \"t2.micro\",\n  \"imageId\" : \"banana\"\n,  \"privateIp\" : \"1.1.1.1\"\n}","signature":"thisisasignature"}`), reg.WorkerIdentityProof)
	require.Equal(t, "w/p", reg.WorkerPoolID)

	require.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	require.Equal(t, "testing", state.Credentials.ClientID, "clientID is correct")
	require.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	require.Equal(t, "cert", state.Credentials.Certificate, "cert is correct")
	require.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	require.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	require.Equal(t, "i-55555nonesense5", state.WorkerID, "workerID is correct")

	require.Equal(t, map[string]string{
		"instance-id":       "i-55555nonesense5",
		"image":             "banana",
		"instance-type":     "t2.micro",
		"availability-zone": "us-west-2a",
		"region":            "us-west-2",
		"local-ipv4":        "1.1.1.1",
		"public-hostname":   "hostname",
		"public-ipv4":       "2.2.2.2",
	}, state.ProviderMetadata, "providerMetadata is correct")

	require.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	require.Equal(t, true, state.WorkerConfig.MustGet("from-ud"), "value for worker-config")

	require.Equal(t, "aws", state.WorkerLocation["cloud"])
	require.Equal(t, "us-west-2", state.WorkerLocation["region"])
	require.Equal(t, "us-west-2a", state.WorkerLocation["availabilityZone"])
}

func TestCheckTerminationTime(t *testing.T) {
	transp := protocol.NewFakeTransport()
	proto := protocol.NewProtocol(transp)

	metaData := map[string]string{}
	instanceIdentityDocument := "{\n  \"instanceId\" : \"i-55555nonesense5\",\n  \"region\" : \"us-west-2\",\n  \"availabilityZone\" : \"us-west-2a\",\n  \"instanceType\" : \"t2.micro\",\n  \"imageId\" : \"banana\"\n,  \"privateIp\" : \"1.1.1.1\"\n}"

	p := &AWSProvider{
		runnercfg:                  nil,
		workerManagerClientFactory: nil,
		metadataService:            &fakeMetadataService{nil, nil, metaData, instanceIdentityDocument},
		proto:                      proto,
		terminationTicker:          nil,
	}

	p.checkTerminationTime()

	// not time yet..
	require.Equal(t, []protocol.Message{}, transp.Messages())

	metaData["/meta-data/spot/termination-time"] = "now!"
	p.checkTerminationTime()

	// protocol does not have the capability set..
	require.Equal(t, []protocol.Message{}, transp.Messages())

	proto.Capabilities.Add("graceful-termination")
	p.checkTerminationTime()

	// now we send a message..
	require.Equal(t, []protocol.Message{
		protocol.Message{
			Type: "graceful-termination",
			Properties: map[string]interface{}{
				"finish-tasks": false,
			},
		},
	}, transp.Messages())
}
