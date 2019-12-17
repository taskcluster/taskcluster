package azure

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
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
	customData := CustomData{
		WorkerPoolId:         "w/p",
		ProviderId:           "amazon",
		WorkerGroup:          "wg",
		RootURL:              "https://tc.example.com",
		ProviderWorkerConfig: &pwcJson,
	}
	customDataJson, err := json.Marshal(customData)
	require.NoError(t, err, "marshalling CustomData")
	customDataBase64 := base64.StdEncoding.EncodeToString(customDataJson)

	userData := &InstanceData{}
	_ = json.Unmarshal([]byte(`{
		"compute": {
			"customData": "`+customDataBase64+`",
			"vmId": "df09142e-c0dd-43d9-a515-489f19829dfd",
			"location": "uswest",
			"vmSize": "medium"
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
      }`), userData)

	attestedDocument := base64.StdEncoding.EncodeToString([]byte("trust me, it's cool --Bill"))

	mds := &fakeMetadataService{nil, userData, nil, &ScheduledEvents{}, nil, attestedDocument}

	p, err := new(runnercfg, tc.FakeWorkerManagerClientFactory, mds)
	require.NoError(t, err, "creating provider")

	state := run.State{
		WorkerConfig: runnercfg.WorkerConfig,
	}
	err = p.ConfigureRun(&state)
	require.NoError(t, err)

	reg, err := tc.FakeWorkerManagerRegistration()
	require.NoError(t, err)
	require.Equal(t, customData.ProviderId, reg.ProviderID)
	require.Equal(t, customData.WorkerGroup, reg.WorkerGroup)
	require.Equal(t, "df09142e-c0dd-43d9-a515-489f19829dfd", reg.WorkerID)
	require.Equal(t, json.RawMessage(`{"document":"`+attestedDocument+`"}`), reg.WorkerIdentityProof)
	require.Equal(t, "w/p", reg.WorkerPoolID)

	require.Equal(t, "https://tc.example.com", state.RootURL, "rootURL is correct")
	require.Equal(t, "testing", state.Credentials.ClientID, "clientID is correct")
	require.Equal(t, "at", state.Credentials.AccessToken, "accessToken is correct")
	require.Equal(t, "cert", state.Credentials.Certificate, "cert is correct")
	require.Equal(t, "w/p", state.WorkerPoolID, "workerPoolID is correct")
	require.Equal(t, "wg", state.WorkerGroup, "workerGroup is correct")
	require.Equal(t, "df09142e-c0dd-43d9-a515-489f19829dfd", state.WorkerID, "workerID is correct")

	require.Equal(t, map[string]interface{}{
		"vm-id":         "df09142e-c0dd-43d9-a515-489f19829dfd",
		"instance-type": "medium",
		"region":        "uswest",
		"local-ipv4":    "10.1.2.4",
		"public-ipv4":   "104.42.72.130",
	}, state.ProviderMetadata, "providerMetadata is correct")

	require.Equal(t, true, state.WorkerConfig.MustGet("from-runner-cfg"), "value for from-runner-cfg")
	require.Equal(t, true, state.WorkerConfig.MustGet("from-ud"), "value for worker-config")

	require.Equal(t, "azure", state.WorkerLocation["cloud"])
	require.Equal(t, "uswest", state.WorkerLocation["region"])
}

func TestCheckTerminationTime(t *testing.T) {
	transp := protocol.NewFakeTransport()
	proto := protocol.NewProtocol(transp)

	evts := &ScheduledEvents{}

	mds := &fakeMetadataService{nil, nil, nil, evts, nil, ""}
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
