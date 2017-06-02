package wsmux

import (
	"net"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
)

/*
TODO: Add ping and pong handlers
*/

const (
	defaultStreamQueueSize      = 20               // size of the accept stream
	defaultKeepAliveInterval    = 10 * time.Second // keep alive interval
	defaultStreamAcceptDeadline = 30 * time.Second // If stream is not accepted within this deadline then timeout
	deadCheckDuration           = 30 * time.Second // check for dead streams every 30 seconds
	defaultKeepAliveWait        = 30 * time.Second // ensure KeepAliveWait > keepAliveInterval
)

// Session implements net.Listener. Allows creating and acception multiplexed streams over ws
type Session struct {
	mu        sync.Mutex         // locks channels and stream map
	streams   map[uint32]*stream // stores streams
	streamCh  chan *stream       // channel used in accept calls
	conn      *websocket.Conn    // underlying websocket connection
	acceptErr error              // error caused by Accept()

	sendLock sync.Mutex // locks send operations

	keepAliveInterval    time.Duration // Keep alives are sent
	streamAcceptDeadline time.Duration // used for timing out accept calls

	logger util.Logger // used for logging

	// id of next stream opened by session. increment by 2
	// default: 0 for server, 1 for client
	nextID uint32

	closed chan struct{} // nil channel

	closeConn bool // used by Close(). if true then conn is closed. default: true

	remoteCloseCallback func() // callback when remote session is closed. default: nil

	streamBufferSize int // buffer size of each stream

	keepAliveTimer *time.Timer
}

// pong handler
func (s *Session) pongHandler(data string) error {
	s.keepAliveTimer.Reset(defaultKeepAliveWait)
	s.logger.Printf("received pong")
	return nil
}

//send keepalives
func (s *Session) sendKeepAlives() {
	ticker := time.Tick(s.keepAliveInterval)
	for {
		s.sendLock.Lock()
		err := s.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(2*time.Second))
		if err != nil {
			_ = s.abort(err)
			return
		}
		s.sendLock.Unlock()
		s.logger.Printf("wrote ping")
		select {
		case <-ticker:
		case <-s.closed:
			return
		}
	}
}

// send a frame over the websocket connection
func (s *Session) send(f frame) error {
	select {
	case <-s.closed:
		return ErrSessionClosed
	default:
	}
	s.sendLock.Lock()
	defer s.sendLock.Unlock()
	err := s.conn.WriteMessage(websocket.BinaryMessage, f.Write())
	s.logger.Printf("wrote %s", f)
	return err
}

// create a new session
func newSession(conn *websocket.Conn, server bool, conf Config) *Session {
	s := &Session{
		conn:     conn,
		streams:  make(map[uint32]*stream),
		streamCh: make(chan *stream, defaultStreamQueueSize),

		closed:    make(chan struct{}),
		closeConn: true,

		nextID: 0,

		keepAliveInterval:    defaultKeepAliveInterval,
		streamAcceptDeadline: defaultStreamAcceptDeadline,
		logger:               &util.NilLogger{},
		streamBufferSize:     DefaultCapacity,
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
		s.streamAcceptDeadline = 0
	}
	if conf.Log != nil {
		s.logger = conf.Log
	}

	if conf.StreamBufferSize != 0 {
		s.streamBufferSize = conf.StreamBufferSize
	}

	s.conn.SetCloseHandler(s.closeHandler)
	s.conn.SetPongHandler(s.pongHandler)

	s.keepAliveTimer = time.AfterFunc(s.keepAliveInterval, func() {
		_ = s.abort(ErrKeepAliveExpired)
	})

	go s.recvLoop()
	go s.removeDeadStreams()
	go s.sendKeepAlives()
	return s
}

// IsClosed returns true if the session is closed
func (s *Session) IsClosed() bool {
	select {
	case <-s.closed:
		return true
	default:
	}
	return false
}

// Accept is used to accept an incoming stream
func (s *Session) Accept() (net.Conn, error) {

	select {
	case <-s.closed:
		s.mu.Lock()
		defer s.mu.Unlock()
		return nil, s.acceptErr
	case str := <-s.streamCh:
		return str, nil
	}
}

// Open creates a new stream
func (s *Session) Open() (net.Conn, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	select {
	case <-s.closed:
		return nil, ErrSessionClosed
	default:
	}

	id := s.nextID
	// increment here so that we can wait safely
	s.nextID += 2
	if _, ok := s.streams[id]; ok {
		return nil, ErrDuplicateStream
	}

	str := newStream(id, s)
	s.streams[id] = str

	if err := s.send(newSynFrame(id)); err != nil {
		s.nextID -= 2
		return nil, err
	}
	// unlock mutex and wait
	s.mu.Unlock()

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

// Close closes the current session and underlying connection
func (s *Session) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if channel has been closed
	if s.IsClosed() {
		return nil
	}

	var err error
	if s.closeConn {
		err = s.conn.Close()
	}

	// invoke callback
	defer func() {
		if s.remoteCloseCallback != nil {
			s.remoteCloseCallback()
		}
	}()

	for _, v := range s.streams {
		v.Kill()
	}
	s.streams = nil
	s.acceptErr = ErrSessionClosed

	close(s.closed)
	return err
}

// Addr used for implementing net.Listener
func (s *Session) Addr() net.Addr {
	return s.conn.LocalAddr()
}

// called when websocket connection is closed
func (s *Session) closeHandler(code int, text string) error {
	s.logger.Printf("ws conn closed: code %d : %s", code, text)
	s.mu.Lock()
	s.closeConn = false
	s.mu.Unlock()
	return s.Close()
}

// receives frames over websocket connection
func (s *Session) recvLoop() {
	for {
		select {
		case <-s.closed:
			return
		default:
		}

		t, msg, err := s.conn.ReadMessage()
		if err != nil {
			_ = s.abort(err)
			break
		}
		if t != websocket.BinaryMessage {
			s.logger.Print("did not receive binary message")
			continue
		}

		if len(msg) < 5 {
			s.logger.Print(errMalformedHeader)
			_ = s.abort(errMalformedHeader)
		}

		h := header(msg[:5])
		msg = msg[5:]

		id, msgType := h.id(), h.msg()

		s.mu.Lock()
		str := s.streams[id]
		s.mu.Unlock()

		if msgType == msgSYN {
			if str != nil {
				s.logger.Printf("dropped duplicate SYN frame for id %d", id)
			} else {
				s.mu.Lock()
				str := newStream(id, s)
				str.AcceptStream(uint32(s.streamBufferSize))
				s.streams[id] = str
				if err := s.send(newAckFrame(id, uint32(s.streamBufferSize))); err != nil {
					s.logger.Print(err)
					_ = s.abort(err)
					return
				}
				s.asyncPushStream(str)
				s.mu.Unlock()
			}
			continue
		}
		if str != nil {
			fr := frame{id: id, msg: msgType, payload: msg}
			str.HandleFrame(fr)
		}

	}
}

//removes stream with given id
func (s *Session) removeStream(id uint32) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.streams[id]; ok {
		delete(s.streams, id)
	}
}

// push stream to streamCh so that it can be accepted
func (s *Session) asyncPushStream(str *stream) {
	select {
	case s.streamCh <- str:
	default:
	}
}

// abort session when error occurs
func (s *Session) abort(e error) error {
	s.mu.Lock()
	s.logger.Print(e)
	s.acceptErr = e

	if s.IsClosed() {
		return nil
	}
	s.mu.Unlock()
	return s.Close()
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
			if str.IsRemovable() {
				s.removeStream(str.id)
			}
		}
		s.mu.Unlock()
	}
}
