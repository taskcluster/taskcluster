package azure

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v28/tools/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v28/tools/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster/v28/tools/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster/v28/tools/taskcluster-worker-runner/tc"
)

func TestConfigureRun(t *testing.T) {
	runnerWorkerConfig := cfg.NewWorkerConfig()
	runnerWorkerConfig, err := runnerWorkerConfig.Set("from-runner-cfg", true)
	require.NoError(t, err, "setting config")
	runnercfg := &cfg.RunnerConfig{
		Provider: cfg.ProviderConfig{
			ProviderType: "azure",
		},
		WorkerImplementation: cfg.WorkerImplementationConfig{
			Implementation: "whatever-worker",
		},
		WorkerConfig: runnerWorkerConfig,
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

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	require.NoError(t, err)

	reg, err := tc.FakeWorkerManagerRegistration()
	require.NoError(t, err)
	require.Equal(t, providerId, reg.ProviderID)
	require.Equal(t, workerGroup, reg.WorkerGroup)
	require.Equal(t, "vm-w-p-test", reg.WorkerID)
	require.Equal(t, json.RawMessage(`{"document":"`+attestedDocument+`"}`), reg.WorkerIdentityProof)
	require.Equal(t, workerPoolId, reg.WorkerPoolID)

	require.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	require.Equal(t, "testing", state.Credentials.ClientID, "clientID is correct")
	require.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	require.Equal(t, "cert", state.Credentials.Certificate, "cert is correct")
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

	require.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	require.Equal(t, true, state.WorkerConfig.MustGet("from-register-worker"), "value for worker-config")

	require.Equal(t, "azure", state.WorkerLocation["cloud"])
	require.Equal(t, "uswest", state.WorkerLocation["region"])

	transp := protocol.NewFakeTransport()
	proto := protocol.NewProtocol(transp)
	proto.SetInitialized()

	p.SetProtocol(proto)
	require.NoError(t, p.WorkerStarted(&state))
	require.True(t, proto.Capable("shutdown"))
}

func TestCheckTerminationTime(t *testing.T) {
	transp := protocol.NewFakeTransport()
	proto := protocol.NewProtocol(transp)
	proto.SetInitialized()

	evts := &ScheduledEvents{}

	mds := &fakeMetadataService{nil, nil, nil, evts, nil, "", nil, []byte(`{}`)}
	p := &AzureProvider{
		runnercfg:                  nil,
		workerManagerClientFactory: nil,
		metadataService:            mds,
		proto:                      proto,
		terminationTicker:          nil,
	}

	p.checkTerminationTime()

	// not time yet..
	require.Equal(t, []protocol.Message{}, transp.Messages())

	// oops, an error!
	mds.ScheduledEventsError = fmt.Errorf("uhoh!")

	p.checkTerminationTime()
	require.Equal(t, []protocol.Message{}, transp.Messages())

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
