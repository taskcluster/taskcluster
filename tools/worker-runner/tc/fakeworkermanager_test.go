package tc

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v50/clients/client-go/tcworkermanager"
)

func TestWorkerManagerRegisterWorker(t *testing.T) {
	wm, _ := FakeWorkerManagerClientFactory("https://tc.example.com", nil)
	reg, err := wm.RegisterWorker(&tcworkermanager.RegisterWorkerRequest{
		ProviderID:          "pid",
		WorkerGroup:         "wg",
		WorkerID:            "wid",
		WorkerIdentityProof: json.RawMessage{},
		WorkerPoolID:        "w/p",
	})
	require.NoError(t, err)
	require.Equal(t, "testing", reg.Credentials.ClientID)
}

func TestWorkerManagerRemoveWorker(t *testing.T) {
	wm, _ := FakeWorkerManagerClientFactory("https://tc.example.com", nil)
	require.NoError(t, wm.RemoveWorker("w/p", "wg", "wid"))
}
