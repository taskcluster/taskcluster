package protocol

import (
	"io"
	"testing"

	"github.com/stretchr/testify/require"
)

func RequireInitialized(t *testing.T, prot *Protocol, initialized bool) {
	prot.initializedCond.L.Lock()
	defer prot.initializedCond.L.Unlock()
	require.Equal(t, initialized, prot.initialized)
}

func TestProtocol(t *testing.T) {
	runnerTransp := NewStdioTransport()
	workerTransp := NewStdioTransport()

	// wire those together in both directions, and finish them at
	// the end of the test
	go func() {
		_, err := io.Copy(runnerTransp, workerTransp)
		if err != nil {
			panic(err)
		}
	}()
	go func() {
		_, err := io.Copy(workerTransp, runnerTransp)
		if err != nil {
			panic(err)
		}
	}()
	defer runnerTransp.Close()
	defer workerTransp.Close()

	runnerProto := NewProtocol(runnerTransp)
	workerProto := NewProtocol(workerTransp)

	gotWelcome := false
	var welcomeCaps []string
	workerProto.Register("welcome", func(msg Message) {
		gotWelcome = true
		welcomeCaps = listOfStrings(msg.Properties["capabilities"])
	})

	var helloCaps []string
	runnerProto.Register("hello", func(msg Message) {
		helloCaps = listOfStrings(msg.Properties["capabilities"])
	})

	RequireInitialized(t, runnerProto, false)
	RequireInitialized(t, workerProto, false)

	runnerProto.Start(false)

	RequireInitialized(t, runnerProto, false)
	RequireInitialized(t, workerProto, false)

	workerProto.Start(true)

	runnerProto.WaitUntilInitialized()
	workerProto.WaitUntilInitialized()

	RequireInitialized(t, workerProto, true)
	RequireInitialized(t, runnerProto, true)

	require.True(t, gotWelcome)
	require.Equal(t, welcomeCaps, KnownCapabilities)
	require.Equal(t, helloCaps, KnownCapabilities)

	require.True(t, workerProto.Capable("graceful-termination"))
	require.True(t, runnerProto.Capable("graceful-termination"))
}
