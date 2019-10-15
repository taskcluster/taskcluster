package awsprovisioner

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	"github.com/taskcluster/taskcluster/clients/client-go/v20/tcawsprovisioner"
)

var testMetadata = map[string]string{
	"/meta-data/ami-id":                      "ami-123",
	"/meta-data/instance-id":                 "i-123",
	"/meta-data/instance-type":               "g12.128xlarge",
	"/meta-data/public-ipv4":                 "1.2.3.4",
	"/meta-data/placement/availability-zone": "rgna",
	"/meta-data/public-hostname":             "foo.ec2-dns",
	"/meta-data/local-ipv4":                  "192.168.0.1",
}

func TestAwsProviderGenericWorkerConfig(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "aws-provisioner",
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "generic-worker",
		},
		WorkerConfig: runnerWorkerConfig,
	}
	token := tc.FakeAwsProvisionerCreateSecret(&tcawsprovisioner.SecretResponse{
		Credentials: tcawsprovisioner.Credentials{
			ClientID:    "cli",
			AccessToken: "at",
			Certificate: "cert",
		},
		Data:   []byte("{}"),
		Scopes: []string{},
	})

	userDataWorkerConfig := cfg.NewWorkerConfig()
	genericWorkerConfig := map[string]interface{}{
		"deploymentId":              "my-deployment-id",
		"ed25519SigningKeyLocation": "/path/to/ed25519-key",
	}

	userDataWorkerConfig, err := userDataWorkerConfig.Set("genericWorker.config", genericWorkerConfig)
	require.NoError(t, err, "setting config")
	fmt.Printf("userDataWorkerConfig: %#v", userDataWorkerConfig)
	userData := &UserData{
		Data:               userDataWorkerConfig,
		WorkerType:         "wt",
		ProvisionerID:      "apv1",
		Region:             "rgn",
		TaskclusterRootURL: "https://tc.example.com",
		SecurityToken:      token,
	}

	p, err := new(runnercfg, tc.FakeAwsProvisionerClientFactory, &fakeMetadataService{nil, userData, testMetadata})
	require.NoError(t, err, "creating provider")

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	require.NoError(t, err, "ConfigureRun")

	require.Equal(t, "my-deployment-id", state.WorkerConfig.MustGet("deploymentId"), "value for deploymentId")
	require.Equal(t, "/path/to/ed25519-key", state.WorkerConfig.MustGet("ed25519SigningKeyLocation"), "value for ed25519SigningKeyLocation")
}

func TestAwsProviderConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-user-data", false) // overridden
	require.NoError(t, err, "setting config")
	runnerWorkerConfig, err = runnerWorkerConfig.Set("from-runner-cfg", true)
	require.NoError(t, err, "setting config")
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "aws-provisioner",
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever",
		},
		WorkerConfig: runnerWorkerConfig,
	}
	token := tc.FakeAwsProvisionerCreateSecret(&tcawsprovisioner.SecretResponse{
		Credentials: tcawsprovisioner.Credentials{
			ClientID:    "cli",
			AccessToken: "at",
			Certificate: "cert",
		},
		Data:   []byte("{}"),
		Scopes: []string{},
	})

	userDataWorkerConfig := cfg.NewWorkerConfig()
	userDataWorkerConfig, err = userDataWorkerConfig.Set("from-user-data", true)
	require.NoError(t, err, "setting config")
	userData := &UserData{
		Data:               userDataWorkerConfig,
		WorkerType:         "wt",
		ProvisionerID:      "apv1",
		Region:             "rgn",
		TaskclusterRootURL: "https://tc.example.com",
		SecurityToken:      token,
	}

	p, err := new(runnercfg, tc.FakeAwsProvisionerClientFactory, &fakeMetadataService{nil, userData, testMetadata})
	require.NoError(t, err, "creating provider")

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	require.NoError(t, err, "ConfigureRun")

	require.Nil(t, tc.FakeAwsProvisionerGetSecret(token), "secret should have been removed")

	require.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	require.Equal(t, "cli", state.Credentials.ClientID, "clientID is correct")
	require.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	require.Equal(t, "cert", state.Credentials.Certificate, "cert is correct")
	require.Equal(t, "apv1/wt", state.WorkerPoolID, "workerPoolID is correct")
	require.Equal(t, "rgn", state.WorkerGroup, "workerGroup is correct")
	require.Equal(t, "i-123", state.WorkerID, "workerID is correct")
	require.Equal(t, map[string]string{
		"ami-id":            "ami-123",
		"instance-id":       "i-123",
		"instance-type":     "g12.128xlarge",
		"public-ipv4":       "1.2.3.4",
		"availability-zone": "rgna",
		"public-hostname":   "foo.ec2-dns",
		"local-ipv4":        "192.168.0.1",
		"region":            "rgn",
	}, state.ProviderMetadata, "providerMetadata is correct")

	require.Equal(t, true, state.WorkerConfig.MustGet("from-user-data"), "value for from-user-data")
	require.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")

	require.Equal(t, "aws", state.WorkerLocation["cloud"])
	require.Equal(t, "rgn", state.WorkerLocation["region"])
	require.Equal(t, "rgna", state.WorkerLocation["availabilityZone"])
}

func TestCheckTerminationTime(t *testing.T) {
	transp := protocol.NewFakeTransport()
	proto := protocol.NewProtocol(transp)

	metaData := map[string]string{}
	p := &AwsProvisionerProvider{
		runnercfg:                   nil,
		awsProvisionerClientFactory: nil,
		metadataService:             &fakeMetadataService{nil, nil, metaData},
		proto:                       proto,
		terminationTicker:           nil,
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
