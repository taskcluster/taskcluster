package testing

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFakeWorker(t *testing.T) {
	wkr := NewFakeWorkerWithCapabilities("cap1", "cap2")
	defer wkr.Close()

	wkr.RunnerProtocol.AddCapability("cap2")
	wkr.RunnerProtocol.AddCapability("cap3")
	wkr.RunnerProtocol.Start(false)
	wkr.RunnerProtocol.WaitUntilInitialized()

	// check that negotiation worked correctly..
	require.False(t, wkr.RunnerProtocol.Capable("cap1"))
	require.True(t, wkr.RunnerProtocol.Capable("cap2"))
	require.False(t, wkr.RunnerProtocol.Capable("cap3"))
}
