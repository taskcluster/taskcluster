package awsprovisioner

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-client-go/tcawsprovisioner"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
)

func TestAwsProviderConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-user-data", false) // overridden
	assert.NoError(t, err, "setting config")
	runnerWorkerConfig, err = runnerWorkerConfig.Set("from-runner-cfg", true)
	assert.NoError(t, err, "setting config")
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "aws-provisioner",
		},
		Worker: cfg.WorkerImplementationConfig{
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
	assert.NoError(t, err, "setting config")
	userData := &UserData{
		Data: userDataData{
			Config: userDataWorkerConfig,
		},
		WorkerType:         "wt",
		ProvisionerID:      "apv1",
		Region:             "rgn",
		TaskclusterRootURL: "https://tc.example.com",
		SecurityToken:      token,
	}

	metaData := map[string]string{
		"/meta-data/ami-id":                      "ami-123",
		"/meta-data/instance-id":                 "i-123",
		"/meta-data/instance-type":               "g12.128xlarge",
		"/meta-data/public-ipv4":                 "1.2.3.4",
		"/meta-data/placement/availability-zone": "rgna",
		"/meta-data/public-hostname":             "foo.ec2-dns",
		"/meta-data/local-ipv4":                  "192.168.0.1",
	}

	p, err := New(runnercfg, tc.FakeAwsProvisionerClientFactory, &fakeMetadataService{nil, userData, metaData})
	assert.NoError(t, err, "creating provider")

	run := runner.Run{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&run)
	assert.NoError(t, err, "ConfigureRun")

	assert.Equal(t, "https://tc.example.com", run.RootURL, "rootURL is correct")
	assert.Equal(t, "cli", run.Credentials.ClientID, "clientID is correct")
	assert.Equal(t, "at", run.Credentials.AccessToken, "accessToken is correct")
	assert.Equal(t, "cert", run.Credentials.Certificate, "cert is correct")
	assert.Equal(t, "apv1/wt", run.WorkerPoolID, "workerPoolID is correct")
	assert.Equal(t, "rgn", run.WorkerGroup, "workerGroup is correct")
	assert.Equal(t, "i-123", run.WorkerID, "workerID is correct")
	assert.Equal(t, map[string]string{
		"ami-id":            "ami-123",
		"instance-id":       "i-123",
		"instance-type":     "g12.128xlarge",
		"public-ipv4":       "1.2.3.4",
		"availability-zone": "rgna",
		"public-hostname":   "foo.ec2-dns",
		"local-ipv4":        "192.168.0.1",
	}, run.ProviderMetadata, "providerMetadata is correct")

	assert.Equal(t, true, run.WorkerConfig.MustGet("from-user-data"), "value for from-user-data")
	assert.Equal(t, true, run.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
}
