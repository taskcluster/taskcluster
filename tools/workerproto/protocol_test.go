package workerproto

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

func TestCapabilityNegotiation(t *testing.T) {
	test := func(t *testing.T, runnerHasCap bool, workerHasCap bool) {
		// wire transports together in both directions, and finish them at
		// the end of the test
		r2wReader, r2wWriter := io.Pipe()
		defer r2wWriter.Close()
		w2rReader, w2rWriter := io.Pipe()
		defer w2rWriter.Close()
		runnerTransp := NewPipeTransport(w2rReader, r2wWriter)
		workerTransp := NewPipeTransport(r2wReader, w2rWriter)

		runnerProto := NewProtocol(runnerTransp)
		workerProto := NewProtocol(workerTransp)

		if runnerHasCap {
			runnerProto.AddCapability("test-capability")
		}
		if workerHasCap {
			workerProto.AddCapability("test-capability")
		}

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
		if runnerHasCap {
			require.Equal(t, welcomeCaps, []string{"test-capability"})
		} else {
			require.Equal(t, welcomeCaps, []string{})
		}

		if workerHasCap {
			require.Equal(t, helloCaps, []string{"test-capability"})
		} else {
			require.Equal(t, helloCaps, []string{})
		}

		// Capable should only return true when both have the capability
		if runnerHasCap && workerHasCap {
			require.Equal(t, true, workerProto.Capable("test-capability"))
			require.Equal(t, true, runnerProto.Capable("test-capability"))
		} else {
			require.Equal(t, false, workerProto.Capable("test-capability"))
			require.Equal(t, false, runnerProto.Capable("test-capability"))
		}
	}

	t.Run("no-capabilities", func(t *testing.T) { test(t, false, false) })
	t.Run("runner-capabilities", func(t *testing.T) { test(t, true, false) })
	t.Run("worker-capabilities", func(t *testing.T) { test(t, false, true) })
	t.Run("both-capabilities", func(t *testing.T) { test(t, true, true) })
}

func TestAddCapabilitiesTooLate(t *testing.T) {
	transp := NewNullTransport()
	proto := NewProtocol(transp)
	proto.Start(false)
	RequireInitialized(t, proto, false)
	require.Panics(t, func() {
		proto.AddCapability("test-capability")
	})
}
