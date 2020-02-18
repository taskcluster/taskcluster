package run

import (
	"testing"

	"github.com/stretchr/testify/require"
	taskcluster "github.com/taskcluster/taskcluster/v25/clients/client-go"
)

func makeState() State {
	return State{
		RootURL: "https://tc.example.com",
		Credentials: taskcluster.Credentials{
			ClientID: "cli",
		},
		WorkerPoolID: "wp/id",
		WorkerGroup:  "wg",
		WorkerID:     "wid",
		WorkerLocation: map[string]string{
			"cloud": "mushroom",
		},
	}
}

func TestCheckProviderResultsNoRootURL(t *testing.T) {
	state := makeState()
	state.RootURL = ""
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsRootURLwithSlash(t *testing.T) {
	state := makeState()
	state.RootURL = "https://tc.example.com/"
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsNoClientID(t *testing.T) {
	state := makeState()
	state.Credentials.ClientID = ""
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsNoWorkerPoolID(t *testing.T) {
	state := makeState()
	state.WorkerPoolID = ""
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsNoWorkerGroup(t *testing.T) {
	state := makeState()
	state.WorkerGroup = ""
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsNoWorkerID(t *testing.T) {
	state := makeState()
	state.WorkerID = ""
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsNoCloud(t *testing.T) {
	state := makeState()
	delete(state.WorkerLocation, "cloud")
	require.Error(t, state.CheckProviderResults())
}
