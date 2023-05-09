package azure

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/tc"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
	ptesting "github.com/taskcluster/taskcluster/v50/tools/workerproto/testing"
)

func TestConfigureRun(t *testing.T) {
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "azure",
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever-worker",
		},
	}

	workerPoolId := "w/p"
	providerId := "azure"
	workerGroup := "wg"

	userData := &InstanceData{}
	_ = json.Unmarshal([]byte(fmt.Sprintf(`{
		"compute": {
			"customData": "",
			"vmId": "df09142e-c0dd-43d9-a515-489f19829dfd",
			"name": "vm-w-p-test",
			"location": "uswest",
			"vmSize": "medium",
			"tagsList": [
				{
					"name": "worker-pool-id",
					"value": "%s"
				},
				{
					"name": "provider-id",
					"value": "%s"
				},
				{
					"name": "worker-group",
					"value": "%s"
				},
				{
					"name": "root-url",
					"value": "https://tc.example.com"
				}
			]
		},
		"network": {
		   "interface": [{
		   	 "ipv4": {
		   	   "ipAddress": [{
		   		 "privateIpAddress": "10.1.2.4",
		   		 "publicIpAddress": "104.42.72.130"
		   	   }]
		   	 }
		   }]
        }
      }`, workerPoolId, providerId, workerGroup)), userData)

	attestedDocument := base64.StdEncoding.EncodeToString([]byte("trust me, it's cool --Bill"))

	// Note: we set empty customData here because we cannot trust the metadata service
	// to properly supply it. These properties come from tags instead.
	// bug 1621037: revert to setting customData once customData is fixed
	mds := &fakeMetadataService{nil, userData, nil, &ScheduledEvents{}, nil, attestedDocument, nil, []byte("{}")}

	p, err := new(runnercfg, tc.FakeWorkerManagerClientFactory, mds)
	require.NoError(t, err, "creating provider")

	state := run.State{}
	err = p.ConfigureRun(&state)
	require.NoError(t, err)

	require.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	require.Equal(t, "azure", state.ProviderID, "providerID is correct")
	require.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	require.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	require.Equal(t, "vm-w-p-test", state.WorkerID, "workerID is correct")

	require.Equal(t, map[string]interface{}{
		"vm-id":         "df09142e-c0dd-43d9-a515-489f19829dfd",
		"instance-type": "medium",
		"region":        "uswest",
		"local-ipv4":    "10.1.2.4",
		"public-ipv4":   "104.42.72.130",
	}, state.ProviderMetadata, "providerMetadata is correct")

	require.Equal(t, "azure", state.WorkerLocation["cloud"])
	require.Equal(t, "uswest", state.WorkerLocation["region"])

	wkr := ptesting.NewFakeWorkerWithCapabilities()
	defer wkr.Close()

	p.SetProtocol(wkr.RunnerProtocol)
	require.NoError(t, p.WorkerStarted(&state))
	wkr.RunnerProtocol.Start(false)
	wkr.RunnerProtocol.WaitUntilInitialized()

	proof, err := p.GetWorkerIdentityProof()
	require.NoError(t, err)
	require.Equal(t, map[string]interface{}{
		"document": attestedDocument,
	}, proof)
}

func TestCheckTerminationTime(t *testing.T) {
	test := func(t *testing.T, proto *workerproto.Protocol, hasCapability bool) {
		evts := &ScheduledEvents{}

		mds := &fakeMetadataService{nil, nil, nil, evts, nil, "", nil, []byte(`{}`)}
		p := &AzureProvider{
			runnercfg:                  nil,
			workerManagerClientFactory: nil,
			metadataService:            mds,
			proto:                      proto,
			terminationTicker:          nil,
		}

		proto.AddCapability("graceful-termination")
		proto.Start(false)

		// not time yet..
		require.False(t, p.checkTerminationTime())

		// oops, an error!
		mds.ScheduledEventsError = fmt.Errorf("uhoh!")
		require.False(t, p.checkTerminationTime())

		mds.ScheduledEventsError = nil

		evt := struct {
			EventId      string
			EventType    string
			ResourceType string
			Resources    []string
			EventStatus  string
			NotBefore    string
		}{
			EventType: "Preempt",
		}
		evts.Events = append(evts.Events, evt)
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
