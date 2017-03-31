package v1

import (
	"encoding/binary"
	"io"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/taskcluster-worker/runtime/ioext"
)

const (
	MaxOutstandingBytes = 8 * 1024 * 1024
	pingInterval        = 15 * time.Second
	writeTimeout        = 2 * pingInterval
	readTimeout         = 3 * pingInterval
)

// ShellClient is the implementation of
// github.com/taskcluster/taskcluster-worker/engines.Shell for v1 shells.
type ShellClient struct {
	ws           *websocket.Conn
	mWrite       sync.Mutex
	stdin        io.WriteCloser

	stdout       io.ReadCloser
	stderr       io.ReadCloser
	stdinReader  *ioext.PipeReader
	stdoutWriter io.WriteCloser
	stderrWriter io.WriteCloser
	paused       bool
}

// New creates a new v1 ShellClient from an existing websocket.
func New(ws *websocket.Conn) *ShellClient {
	stdinReader, stdin := ioext.AsyncPipe()

	s := &ShellClient{
		ws:          ws,
		stdin:       stdin,
		stdinReader: stdinReader,
	}

	s.pause()

	go s.writeMessages()

	s.resume()

	return s
}

func (s *ShellClient) dispose() {
	// close the websocket
	s.ws.Close()

	// close all the pipes
	s.stdinReader.Close()
	s.stdoutWriter.Close()
	s.stderrWriter.Close()
}

// send ensure that there are no concurrent sending of data.
func (s *ShellClient) send(data []byte) error {
	s.mWrite.Lock()
	s.ws.SetWriteDeadline(time.Now().Add(writeTimeout))
	err := s.ws.WriteMessage(websocket.BinaryMessage, data)
	s.mWrite.Unlock()

	return err
}

func (s *ShellClient) pause() error {
	return s.send([]byte{MessageTypePause})
}

func (s *ShellClient) resume() error {
	return s.send([]byte{MessageTypeResume})
}

func (s *ShellClient) writeMessages() {
	m := make([]byte, 1+MaxOutstandingBytes)
	m[0] = StreamStdin
	var size int64

  s.stdinReader.
}

// StdinPipe returns a pipe to which stdin must be written.
// It's important to close stdin, if you expect the remote shell to terminate.
func (s *ShellClient) StdinPipe() io.WriteCloser {
	return s.stdin
}

// StdoutPipe returns a pipe from which stdout must be read.
// It's important to drain this pipe or the shell will block when the internal
// buffer is full.
func (s *ShellClient) StdoutPipe() io.ReadCloser {
	return s.stdout
}

// StderrPipe returns a pipe from which stderr must be read.
// It's important to drain this pipe or the shell will block when the internal
// buffer is full.
func (s *ShellClient) StderrPipe() io.ReadCloser {
	return s.stderr
}

// SetSize will attempt to set the TTY width (columns) and height (rows) on the
// remote shell.
func (s *ShellClient) SetSize(columns, rows uint16) error {
	m := make([]byte, 5)
	m[0] = MessageTypeResize
	binary.LittleEndian.PutUint16(m[1:], columns)
	binary.LittleEndian.PutUint16(m[3:], rows)

	return s.send(m)
}

func (s *ShellClient) Abort() error {
	return nil
}

func (s *ShellClient) Wait() (bool, error) {
	return false, nil
}
