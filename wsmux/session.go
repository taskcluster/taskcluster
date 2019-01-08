package wsmux

import (
	"net"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/websocktunnel/util"
)

const (
	defaultStreamQueueSize      = 200              // size of the accept stream
	defaultKeepAliveInterval    = 20 * time.Second // keep alive interval
	defaultStreamAcceptDeadline = 30 * time.Second // If stream is not accepted within this deadline then timeout
	deadCheckDuration           = 2 * time.Second  // check for dead streams every 2 seconds
)

// Session allows creating and accepting wsmux streams over a websocket connection.
// It is created with the `wsmux.Server` or `wsmux.Client` functions.
//
// Session implements net.Listener
type Session struct {
	// lock for channels and stream map
	mu sync.Mutex

	// established streams, indexed by stream id. Streams opened by the server
	// have an even id, while streams opened by the client have an odd id,
	// preventing any contention.
	streams map[uint32]*stream

	// a channel of new streams initiated by the remote end; Accept pulls from
	// this channel.
	streamCh chan *stream

	// the underlying websocket connection
	conn *websocket.Conn

	// error to be returned by any outstanding Accept calls
	acceptErr error

	// lock for sending data on the connection
	sendLock sync.Mutex

	// Open calls must complete in this duration
	streamAcceptDeadline time.Duration

	// Log drain
	logger util.Logger

	// id of next stream opened by session. increment by 2
	// default: 0 for server, 1 for client
	nextID uint32

	// channel to indicate that the connection is closed
	closed chan struct{}

	// used by Close(). If true then conn must be closed. default: true
	closeConn bool

	// Callback when remote session is closed. default: nil
	closeCallback func()

	// Buffer size of each stream.  This is used to apply backpressure
	// to the remote end, avoiding buffering too much data.
	streamBufferSize int

	// Keep alives are sent at this period
	keepAliveInterval time.Duration

	// Set by the pong handler
	pongSeen bool
}

// newSession creates a new session based on the given configuration, applying
// defaults as necessary.
func newSession(conn *websocket.Conn, server bool, conf Config) *Session {
	s := &Session{
		conn:                 conn,
		streams:              make(map[uint32]*stream),
		streamCh:             make(chan *stream, defaultStreamQueueSize),
		closed:               make(chan struct{}),
		closeConn:            true,
		nextID:               0,
		keepAliveInterval:    defaultKeepAliveInterval,
		streamAcceptDeadline: defaultStreamAcceptDeadline,
		logger:               &util.NilLogger{},
		streamBufferSize:     DefaultCapacity,
		closeCallback:        conf.CloseCallback,
	}

	// streams opened by server are even numbered
	// streams opened by client are odd numbered
	if !server {
		s.nextID = 1
	}

	if conf.KeepAliveInterval != 0 {
		s.keepAliveInterval = conf.KeepAliveInterval
	}
	if conf.StreamAcceptDeadline != 0 {
		s.streamAcceptDeadline = conf.StreamAcceptDeadline
	}
	if conf.Log != nil {
		s.logger = conf.Log
	}

	if conf.StreamBufferSize != 0 {
		s.streamBufferSize = conf.StreamBufferSize
	}

	s.conn.SetCloseHandler(s.closeHandler)
	s.conn.SetPongHandler(s.pongHandler)

	go s.recvLoop()
	go s.removeDeadStreams()
	go s.sendKeepAlives()
	return s
}

// Accept an incoming stream, as specified for the net.Listener interface.
func (s *Session) Accept() (net.Conn, error) {
	select {
	case <-s.closed:
		s.mu.Lock()
		defer s.mu.Unlock()
		return nil, s.acceptErr
	case str := <-s.streamCh:
		if str == nil {
			return nil, ErrSessionClosed
		}

		// "accept" the stream locally, putting it into a state where it can read and write
		str.acceptStream(uint32(s.streamBufferSize))

		// and inform the other side that this stream has been accepted
		if err := s.send(newAckFrame(str.id, uint32(s.streamBufferSize))); err != nil {
			s.abort(err)
			return nil, err
		}
		return str, nil
	}
}

// Open a new stream to the remote end, returning a `net.Conn` as well as a
// stream ID.  The remote end must call Accept to accept the connection.  If
// this does not occur within the deadline, this function will fail.
//
// Opening a connection creates a fresh new stream ID and sends a msgSYN
// frame containing that ID to the remote side.  The stream is considered
// accepted when a msgACK frame arrives with the same stream ID.
func (s *Session) Open() (net.Conn, error) {
	select {
	case <-s.closed:
		return nil, ErrSessionClosed
	default:
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// search for an unused stream id; this makes the conservative assumption
	// that there are far fewer than 2**31 streams open simultaneously, but
	// allows for example a single long-lived stream with a large number of
	// transient streams that cause the id space to wrap
	for {
		if _, ok := s.streams[s.nextID]; !ok {
			break
		}
		s.nextID += 2
	}
	id := s.nextID
	s.nextID += 2

	str := newStream(id, s)
	s.streams[id] = str

	if err := s.send(newSynFrame(id)); err != nil {
		return nil, err
	}

	// unlock mutex and wait
	s.mu.Unlock()

	// locks released by earlier defer call
	select {
	case <-str.accepted:
		s.mu.Lock()
		return str, nil
	case <-s.closed:
		s.mu.Lock()
		// state of s.nextID doesn't matter here
		delete(s.streams, id)
		return nil, ErrSessionClosed
	case <-time.After(s.streamAcceptDeadline):
		s.mu.Lock()
		// nextID can be cyclically reused, and previous instance
		// may be in use by a different stream
		delete(s.streams, id)
		return nil, ErrAcceptTimeout
	}
}

// Close closes the current session and underlying websocket connection.
// All pending Accept calls will fail with ErrSessionClosed, and all existing
// streams will be killed.
func (s *Session) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	select {
	case <-s.closed:
		return nil
	default:
	}

	// Check if channel has been closed
	var err error
	if s.closeConn {
		err = s.conn.Close()
	}

	// invoke callback
	defer func() {
		if s.closeCallback != nil {
			s.closeCallback()
		}
	}()

	for _, v := range s.streams {
		v.kill()
	}
	s.streams = nil
	s.acceptErr = ErrSessionClosed

	close(s.closed)
	close(s.streamCh)
	return err
}

// Addr returns the address of this listener.  This is required for
// implementing net.Listener, but its return value here is not very useful.
func (s *Session) Addr() net.Addr {
	return s.conn.LocalAddr()
}

// IsClosed returns true if the session is closed.
func (s *Session) IsClosed() bool {
	select {
	case <-s.closed:
		return true
	default:
	}
	return false
}

// pongHandler indicates that a pong message has been seen
func (s *Session) pongHandler(data string) error {
	s.mu.Lock()
	s.pongSeen = true
	s.mu.Unlock()
	return nil
}

// sendKeepAlives sends a ping message every keepAliveInterval, until the
// connection closes.  If there is an error sending the ping, or no pong is
// received during the interval, the connection is aborted.
func (s *Session) sendKeepAlives() {
	ticker := time.NewTicker(s.keepAliveInterval)
	for {
		s.sendLock.Lock()
		err := s.conn.WriteControl(
			websocket.PingMessage, nil,
			// use a deadline of half the keepAliveInterval, to ensure the message
			// is sent in a reasonable amount of time
			time.Now().Add(s.keepAliveInterval/2))
		s.sendLock.Unlock()
		if err != nil {
			s.abort(err)
			return
		}

		select {
		case <-ticker.C:
		case <-s.closed:
			return
		}

		// if we have not seen a pong by this time, the connection is
		// considered failed
		s.mu.Lock()
		pongSeen := s.pongSeen
		s.pongSeen = false
		s.mu.Unlock()
		if !pongSeen {
			s.logger.Printf("No pong message seen; aborting session")
			s.abort(ErrKeepAliveExpired)
		}
	}
}

// send transmits a frame over the websocket connection.
func (s *Session) send(f frame) error {
	select {
	case <-s.closed:
		return ErrSessionClosed
	default:
	}
	s.sendLock.Lock()
	defer s.sendLock.Unlock()
	err := s.conn.WriteMessage(websocket.BinaryMessage, f.serialize())
	return err
}

// called when websocket connection is closed
func (s *Session) closeHandler(code int, text string) error {
	s.logger.Printf("wsmux connection closed: code %d : %s", code, text)
	s.mu.Lock()
	// indicate that `s.Close()` need not close the websocket connection,
	// as it is already closed.
	s.closeConn = false
	s.mu.Unlock()
	return s.Close()
}

// recvLoop sits in a groutine and receives frames over the websocket
// connection, calling various `handle` methods as appropriate.
func (s *Session) recvLoop() {
	for {
		select {
		case <-s.closed:
			return
		default:
		}

		t, msg, err := s.conn.ReadMessage()
		if err != nil {
			s.logger.Printf("error while reading from WS: %v", err)
			s.abort(err)
			break
		}
		if t != websocket.BinaryMessage {
			s.logger.Print("did not receive binary message")
			continue
		}

		fr, err := deserializeFrame(msg)
		if err != nil {
			s.logger.Print(err)
			continue
		}

		if fr.msg == msgSYN {
			go s.handleSyn(fr.id)
		} else {
			s.mu.Lock()
			str := s.streams[fr.id]
			s.mu.Unlock()

			if str != nil {
				str.handleFrame(*fr)
			}
		}
	}
}

// handleSyn creates a new stream and adds it to s.streamCh so that it can be returned
// from Accept.  As part of the two-way stream setup handshake, it responds with a
// msgACK frame indicating that the request has been received.
func (s *Session) handleSyn(id uint32) {
	s.mu.Lock()

	// check if stream exists
	_, ok := s.streams[id]
	if ok {
		s.logger.Printf("duplicate SYN frame for stream: %d", id)
		s.mu.Unlock()
		return
	}

	str := newStream(id, s)
	s.streams[id] = str

	defer s.mu.Unlock()
	select {
	case s.streamCh <- str:
	default:
		str.Close()
		s.abort(ErrTooManySyns)
	}
}

// abort session when error occurs
func (s *Session) abort(e error) {
	if s.IsClosed() {
		return
	}

	s.mu.Lock()
	s.logger.Printf("session aborting: %v", e)
	s.acceptErr = e
	s.mu.Unlock()
	s.Close()
}

// loops over streams and removes any streams that are dead
// dead streams are those which are closed, remote side is closed,
// and there is no data in the read buffer
func (s *Session) removeDeadStreams() {
	for {
		select {
		case <-s.closed:
			return
		case <-time.After(deadCheckDuration):
		}

		s.mu.Lock()
		for _, str := range s.streams {

			if str.isRemovable() {
				delete(s.streams, str.id)
			}
		}
		s.mu.Unlock()
	}
}
