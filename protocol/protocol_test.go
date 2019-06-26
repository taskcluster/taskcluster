package protocol

import (
	"io"
	"testing"

	"github.com/stretchr/testify/assert"
)

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

	done := make(chan bool)
	var helloCaps []string
	runnerProto.Register("hello", func(msg Message) {
		helloCaps = listOfStrings(msg.Properties["capabilities"])
		close(done)
	})

	runnerProto.Start(false)
	workerProto.Start(true)

	<-done
	assert.True(t, gotWelcome)
	assert.Equal(t, welcomeCaps, KnownCapabilities)
	assert.Equal(t, helloCaps, KnownCapabilities)
}
