package provider

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v114/tools/worker-runner/provider/aws"
	"github.com/taskcluster/taskcluster/v114/tools/worker-runner/provider/azure"
	"github.com/taskcluster/taskcluster/v114/tools/worker-runner/provider/google"
	"github.com/taskcluster/taskcluster/v114/tools/worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster/v114/tools/worker-runner/provider/standalone"
	"github.com/taskcluster/taskcluster/v114/tools/worker-runner/provider/static"
	ptesting "github.com/taskcluster/taskcluster/v114/tools/workerproto/testing"
)

func TestShouldWorkerTerminateCapability(t *testing.T) {
	// only dynamically provisioned workers have their termination decided by worker-manager
	tests := map[string]struct {
		provider provider.Provider
		want     bool
	}{
		"aws":        {&aws.AWSProvider{}, true},
		"azure":      {&azure.AzureProvider{}, true},
		"google":     {&google.GoogleProvider{}, true},
		"static":     {&static.StaticProvider{}, false},
		"standalone": {&standalone.StandaloneProvider{}, false},
	}
	for providerType := range providers {
		require.Contains(t, tests, providerType, "add provider %s to this test", providerType)
	}

	for providerType, test := range tests {
		t.Run(providerType, func(t *testing.T) {
			wkr := ptesting.NewFakeWorkerWithCapabilities("should-worker-terminate")
			defer wkr.Close()

			test.provider.SetProtocol(wkr.RunnerProtocol)
			wkr.RunnerProtocol.Start(false)

			require.Equal(t, test.want, wkr.RunnerProtocol.Capable("should-worker-terminate"))
		})
	}
}
