package workerproto

import (
	"bytes"
	"io"
	"log"
	"os"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
)

type chunkReader struct {
	chunkSize       int
	eofOnFinalChunk bool
	buffer          []byte
}

func (cr *chunkReader) Read(p []byte) (n int, err error) {
	if len(cr.buffer) == 0 {
		return 0, io.EOF
	}

	if cr.chunkSize <= len(cr.buffer) {
		copy(p, cr.buffer[:cr.chunkSize])
		cr.buffer = cr.buffer[cr.chunkSize:]
		n = cr.chunkSize
	} else {
		copy(p, cr.buffer)
		n = len(cr.buffer)
		cr.buffer = []byte{}
		if cr.eofOnFinalChunk {
			err = io.EOF
		}
	}
	return
}

type testLogDestination struct {
	mutex    sync.Mutex
	messages []string
}

func (dst *testLogDestination) Messages() []string {
	dst.mutex.Lock()
	messages := dst.messages
	dst.mutex.Unlock()
	return messages
}

// Implementation of io.Writer for use as a log output
func (dst *testLogDestination) Write(p []byte) (n int, err error) {
	dst.mutex.Lock()
	message := string(bytes.TrimRight(p, "\n"))
	dst.messages = append(dst.messages, message)
	dst.mutex.Unlock()
	n = len(p)
	return
}

var testPipeInputData = []byte(`
~{"type": "abc"}
not a message
~{"type": "bcdf", "lengthy": "abc abc abc abc abc abc abc abc abc abc abc abc abc abc"}
~{"type": "not valid JSON}
`[1:])

func TestPipeWriter(t *testing.T) {

	doTestPipeInput := func(t *testing.T, chunkSize int, eofOnFinalChunk bool) {
		testLogDest := &testLogDestination{}
		oldLogFlags := log.Flags()
		defer func() {
			log.SetOutput(os.Stderr)
			log.SetFlags(oldLogFlags)
		}()
		log.SetOutput(testLogDest)
		log.SetFlags(0)

		reader := &chunkReader{
			chunkSize:       chunkSize,
			eofOnFinalChunk: eofOnFinalChunk,
			buffer:          testPipeInputData,
		}
		transp := NewPipeTransport(reader, bytes.NewBuffer([]byte{}))

		var got []Message

		for {
			msg, ok := transp.Recv()
			if !ok {
				break
			}
			got = append(got, msg)
		}

		require.Equal(t, []Message{
			Message{Type: "abc", Properties: map[string]interface{}{}},
			Message{Type: "bcdf", Properties: map[string]interface{}{"lengthy": "abc abc abc abc abc abc abc abc abc abc abc abc abc abc"}},
		}, got, "should have gotten two messages")

		require.Equal(t, []string{
			`not a message`,
			`~{"type": "not valid JSON}`,
		}, testLogDest.Messages(), "expected two invalid lines")
	}

	t.Run("full size, eof on last chunk", func(t *testing.T) {
		doTestPipeInput(t, len(testPipeInputData), true)
	})

	t.Run("full size, eof after last chunk", func(t *testing.T) {
		doTestPipeInput(t, len(testPipeInputData), false)
	})

	t.Run("one byte at a time", func(t *testing.T) {
		doTestPipeInput(t, 1, true)
	})

	t.Run("one byte at a time, with eof after last byte", func(t *testing.T) {
		doTestPipeInput(t, 1, true)
	})

	t.Run("only the first line minus the newline to start", func(t *testing.T) {
		doTestPipeInput(t, bytes.IndexByte(testPipeInputData, byte('\n')), false)
	})

	t.Run("first line plus newline to start", func(t *testing.T) {
		doTestPipeInput(t, bytes.IndexByte(testPipeInputData, byte('\n'))+1, false)
	})
}

func TestPipeReader(t *testing.T) {
	output := bytes.NewBuffer([]byte{})
	transp := NewPipeTransport(bytes.NewReader([]byte{}), output)

	transp.Send(Message{Type: "abc", Properties: map[string]interface{}{}})
	transp.Send(Message{Type: "def", Properties: map[string]interface{}{"x": true}})
	transp.Send(Message{Type: "def", Properties: map[string]interface{}{"x": false}})

	require.Equal(t, `
~{"type":"abc"}
~{"type":"def","x":true}
~{"type":"def","x":false}
`[1:], output.String())
}
