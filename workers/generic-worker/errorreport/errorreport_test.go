package errorreport

import (
	"fmt"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster/v93/tools/workerproto"
	workerProtoTesting "github.com/taskcluster/taskcluster/v93/tools/workerproto/testing"
)

func setupProtocols() (*workerproto.Protocol, *workerproto.Protocol) {
	workerTransp, runnerTransp := workerProtoTesting.NewLocalTransportPair()
	workerProto := workerproto.NewProtocol(workerTransp)
	workerProto.AddCapability("error-report")
	workerProto.Start(true)

	runnerProto := workerproto.NewProtocol(runnerTransp)
	runnerProto.AddCapability("error-report")
	return workerProto, runnerProto
}

func TestSendEmptyExtra(t *testing.T) {
	errorReported := false
	lock := sync.Mutex{}

	workerProto, runnerProto := setupProtocols()

	runnerProto.Register("error-report", func(msg workerproto.Message) {
		assert.Contains(t, msg.Properties, "title")
		assert.Equal(t, "generic-worker error", msg.Properties["title"])
		assert.Contains(t, msg.Properties, "kind")
		assert.Equal(t, "worker-error", msg.Properties["kind"])
		assert.Contains(t, msg.Properties, "description")
		assert.Equal(t, "test error", msg.Properties["description"].(string))
		assert.Contains(t, msg.Properties, "extra")
		assert.Equal(t, msg.Properties["extra"], map[string]any{})
		errorReported = true
		lock.Unlock()
	})

	runnerProto.Start(false)
	runnerProto.WaitUntilInitialized()

	// unlocked in callback
	lock.Lock()
	// report test error
	Send(workerProto, fmt.Errorf("test error"), nil)

	lock.Lock()
	defer lock.Unlock()

	assert.True(t, errorReported, "No error-report was received")
}

func TestSendExtra(t *testing.T) {
	errorReported := false
	lock := sync.Mutex{}

	workerProto, runnerProto := setupProtocols()

	runnerProto.Register("error-report", func(msg workerproto.Message) {
		assert.Contains(t, msg.Properties, "extra")
		assert.Contains(t, msg.Properties["extra"], "kangaroo")
		assert.Contains(t, msg.Properties["extra"], "monster")
		assert.Equal(t, "pouches", msg.Properties["extra"].(map[string]any)["kangaroo"].(string))
		assert.Equal(t, "trucks", msg.Properties["extra"].(map[string]any)["monster"].(string))
		errorReported = true
		lock.Unlock()
	})

	runnerProto.Start(false)
	runnerProto.WaitUntilInitialized()

	// unlocked in callback
	lock.Lock()
	// report test error
	Send(workerProto, fmt.Errorf("test error"), map[string]string{
		"kangaroo": "pouches",
		"monster":  "trucks",
	})

	lock.Lock()
	defer lock.Unlock()
	assert.True(t, errorReported, "No error-report was received")
}
