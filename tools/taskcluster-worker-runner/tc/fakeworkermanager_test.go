package tc

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster/v25/clients/client-go/tcworkermanager"
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
	if assert.NoError(t, err) {
		assert.Equal(t, "testing", reg.Credentials.ClientID)
	}
}
