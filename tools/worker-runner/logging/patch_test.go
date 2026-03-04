package logging

import (
	"log"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPatchLogger(t *testing.T) {
	oldLogDestination := Destination
	defer func() { Destination = oldLogDestination }()
	logDest := &TestLogDestination{}
	Destination = logDest

	stdLog := log.New(os.Stderr, "", log.LstdFlags)
	PatchStdLogger(stdLog)

	t.Run("single-line println", func(t *testing.T) {
		defer logDest.Clear()
		stdLog.Println("hello, world!")
		require.Equal(t, logDest.Messages(), []map[string]any{{"textPayload": "hello, world!"}})
	})

	t.Run("multi-line println", func(t *testing.T) {
		defer logDest.Clear()
		stdLog.Println("hello\ncruel\nworld!")
		require.Equal(t, logDest.Messages(), []map[string]any{{"textPayload": "hello\ncruel\nworld!"}})
	})

	t.Run("very long multi-line printf", func(t *testing.T) {
		defer logDest.Clear()
		msg := "a line of text\n"
		// 2**20 = 1M so the total length is 1M times line length
		for range 20 {
			msg += msg
		}
		msg = msg[:len(msg)-1] // remove trailing newline
		stdLog.Print(msg)
		require.Equal(t, logDest.Messages(), []map[string]any{{"textPayload": msg}})
	})
}
