package dockerExecWS

import (
	"encoding/binary"
	"fmt"
	"io"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/taskcluster-cli/external/pkg/iopipes"
	"github.com/taskcluster/taskcluster-worker/plugins/interactive/shellconsts"
	"github.com/taskcluster/taskcluster-worker/runtime/atomics"
)

const (
	// MaxOutstandingBytes is the maximum number of unsent bytes in the stdin buffer.
	MaxOutstandingBytes = 8 * 1024 * 1024
	pingInterval        = 15 * time.Second
	writeTimeout        = 2 * pingInterval
	readTimeout         = 3 * pingInterval
)

var dialer = websocket.Dialer{
	HandshakeTimeout: shellconsts.ShellHandshakeTimeout,
	ReadBufferSize:   shellconsts.ShellMaxMessageSize,
	WriteBufferSize:  shellconsts.ShellMaxMessageSize,
}

// ShellClient is the implementation of
// github.com/taskcluster/taskcluster-worker/engines.Shell for v1 shells.
type ShellClient struct {
	ws       *websocket.Conn
	done     chan struct{}
	mWrite   sync.Mutex
	cPause   *sync.Cond
	paused   bool
	complete atomics.Once
	success  bool
	err      error

	stdin        io.WriteCloser
	stdinReader  io.ReadCloser
	stdout       io.ReadCloser
	stdoutWriter *iopipes.DrainingPipeWriter
	stderr       io.ReadCloser
	stderrWriter *iopipes.DrainingPipeWriter
}

// Dial will built a proper shell websocket URL, connect to the server and return an initialized shell client.
func Dial(socketURL string, command []string, tty bool) (*ShellClient, error) {
	u, err := url.Parse(socketURL)
	if err != nil {
		return nil, fmt.Errorf("Invalid socketURL: %s, parsing error: %s",
			socketURL, err)
	}
	q := u.Query()

	// Ensure the URL has ws or wss as scheme
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	} // Set command arguments overwriting any existing querystring values
	q.Del("command")
	if len(command) > 0 {
		for _, arg := range command {
			q.Add("command", arg)
		}
	}

	// Set tty true or false
	if tty {
		q.Set("tty", "true")
	} else {
		q.Set("tty", "false")
	}

	// Set querystring on url
	u.RawQuery = q.Encode()

	// Dial up to the constructed URL
	ws, _, err := dialer.Dial(u.String(), nil)
	if err != nil {
		return nil, err
	}

	// Return a new ShellClient wrapping the websocket
	return New(ws), nil
}

// New creates a new v1 ShellClient from an existing websocket.
func New(ws *websocket.Conn) *ShellClient {
	stdinReader, stdin := iopipes.InfinitePipe()
	outputChan := make(chan bool)
	stdout, stdoutWriter := iopipes.DrainingPipe(MaxOutstandingBytes, outputChan)
	stderr, stderrWriter := iopipes.DrainingPipe(MaxOutstandingBytes, outputChan)

	s := &ShellClient{
		ws:      ws,
		done:    make(chan struct{}),
		success: true,

		cPause: sync.NewCond(&sync.Mutex{}),

		stdin:        stdin,
		stdinReader:  stdinReader,
		stdout:       stdout,
		stdoutWriter: stdoutWriter,
		stderr:       stderr,
		stderrWriter: stderrWriter,
	}

	s.pauseServer()

	// This function unblocks the stream when an output pipe gets drained.
	go func() {
		for {
			select {
			case <-s.done:
				break
			case <-outputChan:
				s.resumeServer()
			}
		}
	}()

	go s.writeMessages()
	go s.receiveMessages()

	s.resumeServer()

	return s
}

func (s *ShellClient) dispose() {
	select {
	case <-s.done:
	default:
		close(s.done)
	}

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
	defer s.mWrite.Unlock()

	s.ws.SetWriteDeadline(time.Now().Add(writeTimeout))
	err := s.ws.WriteMessage(websocket.BinaryMessage, data)

	return err
}

// pauseClient pauses the sending of data to the server.
func (s *ShellClient) pauseClient() {
	s.cPause.L.Lock()
	defer s.cPause.L.Unlock()

	fmt.Fprintln(os.Stderr, "Pausing client")
	s.paused = true
	s.cPause.Broadcast()
}

// resumeClient resume the sending of data to the server.
func (s *ShellClient) resumeClient() {
	s.cPause.L.Lock()
	defer s.cPause.L.Unlock()

	fmt.Fprintln(os.Stderr, "Resuming client")
	s.paused = false
	s.cPause.Broadcast()
}

// pauseServer lets the server know that we aren't ready to receive messages.
func (s *ShellClient) pauseServer() error {
	fmt.Fprintln(os.Stderr, "Pausing server")
	return s.send([]byte{messageTypePause})
}

// resumeServer lets the server know that we are ready to receive messages.
func (s *ShellClient) resumeServer() error {
	fmt.Fprintln(os.Stderr, "Resuming server")
	return s.send([]byte{messageTypeResume})
}

func (s *ShellClient) writeMessages() {
	for {
		s.cPause.L.Lock()
		for s.paused {
			s.cPause.Wait()
		}
		s.cPause.L.Unlock()
		// we limit a read to MaxOutstandingBytes
		r := io.LimitReader(s.stdinReader, MaxOutstandingBytes)

		m := make([]byte, 1+MaxOutstandingBytes)
		m[0] = streamStdin

		data := m[1:]
		n, err := r.Read(data)
		if err != nil {
			if err != io.EOF {
				s.complete.Do(func() {
					s.success = false
					s.err = err
					s.dispose()
				})
			}
		}

		if n != MaxOutstandingBytes {
			m = m[:n+1]
		}
		err = s.send(m)
		if err != nil {
			s.complete.Do(func() {
				s.success = false
				s.err = err
				s.dispose()
			})
		}
	}
}

func (s *ShellClient) receiveMessages() {
	for {
		// Get the latest message from the websocket
		t, msg, err := s.ws.ReadMessage()
		if err != nil {
			s.complete.Do(func() {
				s.success = false
				s.err = err
				s.dispose()
			})
			return
		}

		// Ignore non binary or empty messages.
		if t != websocket.BinaryMessage || len(msg) == 0 {
			continue
		}

		msgType := msg[0]
		msgData := []byte{}
		if len(msg) > 1 {
			msgData = msg[1:]
		}

		switch msgType {
		case messageTypePause:
			s.pauseClient()
		case messageTypeResume:
			s.resumeClient()
		case streamStdout:
			_, err := s.stdoutWriter.Write(msgData)
			if err != nil {
				if err == iopipes.ErrPipeFull {
					// this isn't a "real" error condition, but we use it to signal that
					// data should be buffered.
					s.pauseServer()
				} else {
					s.complete.Do(func() {
						s.success = false
						s.err = err
						s.dispose()
					})
				}
			}
		case streamStderr:
			_, err := s.stderrWriter.Write(msgData)
			if err != nil {
				if err == iopipes.ErrPipeFull {
					// this isn't a "real" error condition, but we use it to signal that
					// data should be buffered.
					s.pauseServer()
				} else {
					s.complete.Do(func() {
						s.success = false
						s.err = err
						s.dispose()
					})
				}
			}
		case messageTypeStopped:
			s.complete.Do(func() {
				s.success = false
				s.err = fmt.Errorf("Remote process terminated with error code %v", msgData[0])
				s.dispose()
			})
		case messageTypeShutdown:
			s.complete.Do(func() {
				s.dispose()
			})
			return
		case messageTypeError:
			// nothing.
		}
	}
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
	m[0] = messageTypeResize
	binary.LittleEndian.PutUint16(m[1:], columns)
	binary.LittleEndian.PutUint16(m[3:], rows)

	return s.send(m)
}

// Abort will forcibly disconnect and terminate the shell client.
func (s *ShellClient) Abort() error {
	return nil
}

// Wait waits until the shell client exits.
func (s *ShellClient) Wait() (bool, error) {
	s.complete.Wait()
	return s.success, s.err
}
