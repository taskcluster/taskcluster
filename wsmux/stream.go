package wsmux

import (
	"encoding/binary"
	"io"
	"net"
	"sync"
	"time"

	"github.com/taskcluster/websocktunnel/util"
)

const (
	// DefaultCapacity of read buffer.
	DefaultCapacity = 1024
)

type streamState int

const (
	// stream has been created locally. Buffer is empty. Has not been accepted
	// remotely.
	streamCreated streamState = iota

	// stream has been accepted remotely. read and write operations are permitted.
	streamAccepted

	// stream has been closed locally
	streamClosed

	// stream has been closed remotely
	streamRemoteClosed

	// stream has been closed both locally and remotely
	streamDead
)

// A stream represents a bidirectional bytestream within the context of a particular
// Session.
//
// This struct implements net.Conn.
type stream struct {
	// id of the stream within the session
	id uint32

	// mutex for state transitions
	m sync.Mutex

	// used for broadcasting when streamClosed, data read, or data pushed to buffer
	c *sync.Cond

	// read buffer, containing bytes we have received
	b *buffer

	// number of bytes that can be sent to remote (updated by receiving ACKs).
	// This essentially tracks data that is "in flight" from here to the remote
	// side and on through whatever processing the remote application is doing.
	// It provides a mechanism for applying "backpressure" when the remote end
	// cannot buffer data as quickly as we send it.
	unblocked uint32

	// error causes stream to close
	endErr error

	// current state of the stream
	state streamState

	// closed when stream is accepted. Used in session.Open()
	accepted chan struct{}

	// associated session. used for sending frames and logging
	session *Session

	// timers for read and write operations
	readTimer  *time.Timer
	writeTimer *time.Timer

	// true when timers expire
	readDeadlineExceeded  bool
	writeDeadlineExceeded bool
}

// newStream creates a new stream with the given id.  No frames are sent.  This
// is used both for locally initiated streams and remotely initiated streams.
func newStream(id uint32, session *Session) *stream {
	if session == nil {
		panic("session must not be nil")
	}
	str := &stream{
		id:        id,
		b:         newBuffer(session.streamBufferSize),
		unblocked: 0,
		state:     streamCreated,
		accepted:  make(chan struct{}),

		endErr: nil,

		readTimer:             nil,
		writeTimer:            nil,
		readDeadlineExceeded:  false,
		writeDeadlineExceeded: false,

		session: session,
	}

	str.c = sync.NewCond(&str.m)

	return str
}

// handleFrame processes frames received by the stream (so, any frame except msgSYN)
func (s *stream) handleFrame(fr frame) {
	switch fr.msg {
	case msgACK:
		cap := binary.LittleEndian.Uint32(fr.payload)
		select {
		case <-s.accepted:
			// stream is already accepted, so broadcast the increased capacity
			s.unblockAndBroadcast(cap)
		default:
			// stream is not yet accepted, so mark it accepted
			s.acceptStream(cap)
		}

	case msgDAT:
		s.pushAndBroadcast(fr.payload)

	case msgFIN:
		s.setRemoteClosed()
	}
}

// onExpired is an internal helper method which sets val = true and broadcasts
func (s *stream) onExpired(val *bool) func() {
	return func() {
		s.m.Lock()
		defer s.m.Unlock()
		defer s.c.Broadcast()
		*val = true
	}
}

// SetReadDeadline sets the read timer to the given time.  When it expires,
// readDeadlineExceeded will be set to true.
//
// This is part of the net.Conn interface.
func (s *stream) SetReadDeadline(t time.Time) error {
	s.m.Lock()
	defer s.m.Unlock()
	// stop timer if not nil
	if s.readTimer != nil {
		_ = s.readTimer.Stop()
		s.readTimer = nil
	}
	// clear streamDeadline exceeded
	s.readDeadlineExceeded = false
	if !t.IsZero() {
		delay := time.Until(t)
		s.readTimer = time.AfterFunc(delay, s.onExpired(&s.readDeadlineExceeded))
	}

	return nil
}

// SetWriteDeadline sets the write timer to the given time.  When it expires,
// writeDeadlineExceeded will be set to true.
//
// This is part of the net.Conn interface.
func (s *stream) SetWriteDeadline(t time.Time) error {
	s.m.Lock()
	defer s.m.Unlock()
	//stop timer if not nil
	if s.writeTimer != nil {
		_ = s.writeTimer.Stop()
		s.writeTimer = nil
	}
	// clear streamDeadline exceeded
	s.writeDeadlineExceeded = false
	if !t.IsZero() {
		delay := time.Until(t)
		s.writeTimer = time.AfterFunc(delay, s.onExpired(&s.writeDeadlineExceeded))
	}

	return nil
}

// SetDeadline sets the read and write streamDeadlines for the stream to the same time.
//
// This is part of the net.Conn interface.
func (s *stream) SetDeadline(t time.Time) error {
	if err := s.SetReadDeadline(t); err != nil {
		s.endErr = err
		return err
	}
	if err := s.SetWriteDeadline(t); err != nil {
		s.endErr = err
		return err
	}
	return nil
}

// unblockAndBroadcast unblocks bytes and broadcasts so that writes can
// continue.  The unblocked capacity is increased by cap
func (s *stream) unblockAndBroadcast(cap uint32) {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()
	defer s.session.logger.Printf("unblock broadcasted : stream %d", s.id)
	s.unblocked += cap
}

// pushAndBroadcast adds data to the read buffer and broadcasts so that
// reads can continue
func (s *stream) pushAndBroadcast(buf []byte) {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()
	defer s.session.logger.Printf("push broadcasted : stream %d", s.id)
	_, err := s.b.Write(buf)
	s.endErr = err
}

// acceptStream accepts the current stream, moving it to the streamAccepted
// state.  For remotely-initiated streams, this is called directly from
// Session.Open; for locally-initiated streams, it is called when the msgACK
// frame for the new stream is received.
func (s *stream) acceptStream(read uint32) {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()
	s.unblocked += read
	s.state = streamAccepted
	close(s.accepted)

}

// A stream is considered removable if it is in the streamDead state and its
// read buffer has been entirely consumed.
func (s *stream) isRemovable() bool {
	s.m.Lock()
	defer s.m.Unlock()
	return s.state == streamDead && s.b.Len() == 0
}

// setRemoteClosed handles a msgFIN frame from the remote side.  If the stream
// has been closed locally, it becomes dead; otherwise it is in state
// streamRemoteClosed.
func (s *stream) setRemoteClosed() {
	s.m.Lock()
	s.session.logger.Printf("remote stream %d closed connection", s.id)
	defer s.m.Unlock()
	defer s.c.Broadcast()
	if s.state == streamClosed {
		s.state = streamDead
	} else {
		s.state = streamRemoteClosed
	}
}

// LocalAddr returns the local address of the underlying connection
//
// This is part of the net.Conn interface.  Its value in this context is not
// particularly useful.
func (s *stream) LocalAddr() net.Addr {
	return s.session.conn.LocalAddr()
}

// RemoteAddr returns the remote address of the underlying connection
//
// This is part of the net.Conn interface.  Its value in this context is not
// particularly useful.
func (s *stream) RemoteAddr() net.Addr {
	return s.session.conn.RemoteAddr()
}

// Close closes the stream, sending a msgFin frame unless one has already been
// sent.  If the remote end has not closed the stream, then it will remain in
// state streamClosed.
func (s *stream) Close() error {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()

	switch s.state {
	// return nil if already streamClosed
	case streamDead:
		return nil
	case streamClosed:
		return nil
	case streamRemoteClosed:
		s.state = streamDead
	default:
		s.state = streamClosed
	}

	if err := s.session.send(newFinFrame(s.id)); err != nil {
		return err
	}

	return nil
}

// Read reads bytes from the stream.  Data is acknowledged as it is received.
func (s *stream) Read(buf []byte) (int, error) {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()

	for s.b.Len() == 0 && s.endErr == nil && !s.readDeadlineExceeded && s.state != streamRemoteClosed && s.state != streamDead {
		s.session.logger.Printf("stream %d: read waiting", s.id)
		// wait
		s.c.Wait()
	}

	// return EOF if buffer is empty and remote end is closed (streamRemoteClosed or streamDead)
	if s.b.Len() == 0 && (s.state == streamRemoteClosed || s.state == streamDead) {
		return 0, io.EOF
	}

	if s.readDeadlineExceeded {
		return 0, ErrReadTimeout
	}

	if s.endErr != nil {
		return 0, s.endErr
	}

	n, _ := s.b.Read(buf)

	// send a msgACK to indicate we received n bytes.  Note that this is not sent when we receive the
	// msgDAT frame, but when we are about to return it to the caller; this conveys information about how
	// quickly this process is actually consuming the data, rather than just how quickly the local TCP
	// stack can receive it.
	if err := s.session.send(newAckFrame(s.id, uint32(n))); err != nil {
		return n, err
	}

	return n, nil
}

// Write writes bytes to the stream.  This will block until the bytes have been
// written, but not until they have been acknowledged.
func (s *stream) Write(buf []byte) (int, error) {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()

	l, w := len(buf), 0
	for w < l {
		for s.unblocked == 0 && s.endErr == nil && !s.writeDeadlineExceeded && s.state != streamClosed && s.state != streamDead {
			s.session.logger.Printf("stream %d: write waiting", s.id)
			// wait for signal
			s.c.Wait()
		}

		// if stream is streamClosed or waiting to be empty then abort
		// unblocked not checked as stream can be closed, but bytes may be unblocked by remote
		if s.state == streamClosed || s.state == streamDead {
			return w, ErrBrokenPipe
		}

		if s.writeDeadlineExceeded {
			return w, ErrWriteTimeout
		}

		if s.endErr != nil {
			return w, s.endErr
		}

		// send as much data as unblocked allows; we will wait for msgACKs
		// before sending any additional bytes.
		cap := util.Min(len(buf), int(s.unblocked))
		if err := s.session.send(newDataFrame(s.id, buf[:cap])); err != nil {
			return w, err
		}
		buf = buf[cap:]
		s.unblocked -= uint32(cap)
		w += cap
	}

	return w, nil
}

// Kill forces the stream into the streamDead state.  Note that this does not send a
// msgFIN frame, but does terminate any pending Read or Write operations.
func (s *stream) kill() {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()
	s.session.logger.Printf("stream %d killed", s.id)
	s.state = streamDead
}
