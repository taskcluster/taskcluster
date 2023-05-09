package aws

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/tc"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
	ptesting "github.com/taskcluster/taskcluster/v50/tools/workerproto/testing"
)

func TestAWSConfigureRun(t *testing.T) {
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "aws",
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever-worker",
		},
	}

	userData := &UserData{
		WorkerPoolId: "w/p",
		ProviderId:   "amazon",
		WorkerGroup:  "wg",
		RootURL:      "https://tc.example.com",
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

	state := run.State{}
	err = p.ConfigureRun(&state)
	require.NoError(t, err)

	require.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	require.Equal(t, "amazon", state.ProviderID, "providerID is correct")
	require.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	require.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	require.Equal(t, "i-55555nonesense5", state.WorkerID, "workerID is correct")

	require.Equal(t, map[string]interface{}{
		"instance-id":       "i-55555nonesense5",
		"image":             "banana",
		"instance-type":     "t2.micro",
		"availability-zone": "us-west-2a",
		"region":            "us-west-2",
		"local-ipv4":        "1.1.1.1",
		"public-hostname":   "hostname",
		"public-ipv4":       "2.2.2.2",
	}, state.ProviderMetadata, "providerMetadata is correct")

	require.Equal(t, "aws", state.WorkerLocation["cloud"])
	require.Equal(t, "us-west-2", state.WorkerLocation["region"])
	require.Equal(t, "us-west-2a", state.WorkerLocation["availabilityZone"])

	wkr := ptesting.NewFakeWorkerWithCapabilities()
	defer wkr.Close()

	p.SetProtocol(wkr.RunnerProtocol)
	require.NoError(t, p.WorkerStarted(&state))
	wkr.RunnerProtocol.Start(false)
	wkr.RunnerProtocol.WaitUntilInitialized()

	proof, err := p.GetWorkerIdentityProof()
	require.NoError(t, err)
	require.Equal(t, map[string]interface{}{
		"document":  "{\n  \"instanceId\" : \"i-55555nonesense5\",\n  \"region\" : \"us-west-2\",\n  \"availabilityZone\" : \"us-west-2a\",\n  \"instanceType\" : \"t2.micro\",\n  \"imageId\" : \"banana\"\n,  \"privateIp\" : \"1.1.1.1\"\n}",
		"signature": "thisisasignature",
	}, proof)
}

func TestCheckTerminationTime(t *testing.T) {
	test := func(t *testing.T, proto *workerproto.Protocol, hasCapability bool) {

		metaData := map[string]string{}
		instanceIdentityDocument := "{\n  \"instanceId\" : \"i-55555nonesense5\",\n  \"region\" : \"us-west-2\",\n  \"availabilityZone\" : \"us-west-2a\",\n  \"instanceType\" : \"t2.micro\",\n  \"imageId\" : \"banana\"\n,  \"privateIp\" : \"1.1.1.1\"\n}"

		p := &AWSProvider{
			runnercfg:                  nil,
			workerManagerClientFactory: nil,
			metadataService:            &fakeMetadataService{nil, nil, metaData, instanceIdentityDocument},
			proto:                      proto,
			terminationTicker:          nil,
		}

		proto.AddCapability("graceful-termination")
		proto.Start(false)

		// not time yet..
		require.False(t, p.checkTerminationTime())

		metaData["/meta-data/spot/termination-time"] = "now!"
		require.True(t, p.checkTerminationTime())
	}

	t.Run("without capability", func(t *testing.T) {
		wkr := ptesting.NewFakeWorkerWithCapabilities()
		defer wkr.Close()

		gotTerm := wkr.MessageReceivedFunc("graceful-termination", nil)

		test(t, wkr.RunnerProtocol, false)

		require.False(t, gotTerm())
	})

	t.Run("with capability", func(t *testing.T) {
		wkr := ptesting.NewFakeWorkerWithCapabilities("graceful-termination")
		defer wkr.Close()

		gotTerm := wkr.MessageReceivedFunc("graceful-termination", nil)

		test(t, wkr.RunnerProtocol, false)

		require.True(t, gotTerm())
	})
}
