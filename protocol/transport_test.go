package protocol

import (
	"bytes"
	"fmt"
	"io"
	"testing"

	"github.com/stretchr/testify/assert"
)

// Write the given data in chunks of the given size
func writeInChunks(data []byte, chunkSize int, writer io.WriteCloser) error {
	for {
		if len(data) == 0 {
			break
		}

		if len(data) >= chunkSize {
			chunkSize = len(data)
		}
		n, err := writer.Write(data[:chunkSize])
		if err != nil {
			return err
		}
		if n < chunkSize {
			return fmt.Errorf("Write returned < input size without an error (interface contract violation")
		}
		data = data[chunkSize:]
	}

	err := writer.Close()
	if err != nil {
		return err
	}

	return nil
}

// Read messages from a message channel and write them to an array
func readMessages(source chan Message, dest *[]Message) {
	for m := range source {
		*dest = append(*dest, m)
	}
}

var testWriterData = []byte(`
~{"type": "abc"}
not a message
~{"type": "bcdf", "lengthy": "abc abc abc abc abc abc abc abc abc abc abc abc abc abc"}
~{"type": "not valid JSON}
`[1:])

func doTestWriter(t *testing.T, chunkSize int) {
	transp := NewStdioTransport()

	var invalid bytes.Buffer
	transp.InvalidLines = &invalid

	err := writeInChunks(testWriterData, chunkSize, transp)
	assert.NoError(t, err, "should not fail")

	// note that this depends on the channel having capacity for all of the messages

	var got []Message
	readMessages(transp.In, &got)
	assert.Equal(t, []Message{
		Message{Type: "abc", Properties: map[string]interface{}{}},
		Message{Type: "bcdf", Properties: map[string]interface{}{"lengthy": "abc abc abc abc abc abc abc abc abc abc abc abc abc abc"}},
	}, got, "should have gotten two messages")

	assert.Equal(t, `
not a message
~{"type": "not valid JSON}
`[1:], invalid.String(), "expected two invalid lines")
}

func TestWriterFullSize(t *testing.T) {
	doTestWriter(t, len(testWriterData))
}

func TestWriterByteAtATime(t *testing.T) {
	doTestWriter(t, 1)
}

func TestWriterFirstLine(t *testing.T) {
	doTestWriter(t, bytes.IndexByte(testWriterData, byte('\n')))
}

func TestWriterFirstLinePlusNewlin(t *testing.T) {
	doTestWriter(t, bytes.IndexByte(testWriterData, byte('\n'))+1)
}

func TestReaderBigChunk(t *testing.T) {
	transp := NewStdioTransport()

	transp.Out <- Message{Type: "abc", Properties: map[string]interface{}{}}
	transp.Out <- Message{Type: "def", Properties: map[string]interface{}{"x": true}}
	transp.Out <- Message{Type: "def", Properties: map[string]interface{}{"x": false}}
	close(transp.Out)

	var result bytes.Buffer
	_, err := io.Copy(&result, transp)
	assert.NoError(t, err)

	assert.Equal(t, `
~{"type":"abc"}
~{"type":"def","x":true}
~{"type":"def","x":false}
`[1:], result.String())
}

func TestReaderByteAtATime(t *testing.T) {
	transp := NewStdioTransport()

	transp.Out <- Message{Type: "abc", Properties: map[string]interface{}{}}
	transp.Out <- Message{Type: "def", Properties: map[string]interface{}{"x": true}}
	transp.Out <- Message{Type: "def", Properties: map[string]interface{}{"x": false}}
	close(transp.Out)

	var result []byte
	for {
		b := make([]byte, 1)
		n, err := transp.Read(b)
		if err == io.EOF {
			assert.Equal(t, 0, n)
			break
		}
		assert.NoError(t, err)
		result = append(result, b[:n]...)
	}

	assert.Equal(t, `
~{"type":"abc"}
~{"type":"def","x":true}
~{"type":"def","x":false}
`[1:], string(result))
}

func TestReaderUnmarshalable(t *testing.T) {
	transp := NewStdioTransport()

	transp.Out <- Message{Type: "def", Properties: map[string]interface{}{"x": make(chan int)}}
	close(transp.Out)

	var result bytes.Buffer
	_, err := io.Copy(&result, transp)
	assert.Error(t, err)
}
