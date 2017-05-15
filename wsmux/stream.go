package wsmux

import (
	"io"
	"net"
	"sync"
	"time"
)

const (
	DefaultCapacity = 1024
	veryLongTime    = time.Hour * 10 // a long time period...treated as infinite
)

type stream struct {
	id        uint32
	m         sync.Mutex
	c         *sync.Cond
	b         *buffer
	unblocked uint32

	endErr error

	closed       bool
	remoteClosed bool
	accepted     chan struct{}

	session *Session

	timeLock              sync.Mutex
	readTimer             *time.Timer
	writeTimer            *time.Timer
	readDeadlineExceeded  bool
	writeDeadlineExceeded bool
}

func newStream(id uint32, session *Session) *stream {
	str := &stream{
		id:        id,
		b:         newBuffer(DefaultCapacity),
		unblocked: 0,

		endErr: nil,

		closed:       false,
		remoteClosed: false,
		accepted:     make(chan struct{}),

		readTimer:             time.NewTimer(veryLongTime),
		writeTimer:            time.NewTimer(veryLongTime),
		readDeadlineExceeded:  false,
		writeDeadlineExceeded: false,

		session: session,
	}

	str.c = sync.NewCond(&str.m)
	go str.checkTimers()

	return str
}

// SetReadDeadline sets the read timer
func (s *stream) SetReadDeadline(t time.Time) error {
	s.timeLock.Lock()
	defer s.timeLock.Unlock()

	// clear deadline exceeded
	s.m.Lock()
	s.readDeadlineExceeded = false
	s.m.Unlock()

	if !s.readTimer.Stop() {
		select {
		// drain the channel
		case <-s.readTimer.C:
		default:
		}
	}

	if t.IsZero() {
		_ = s.writeTimer.Reset(veryLongTime)
		return nil
	}

	delay := t.Sub(time.Now())
	_ = s.readTimer.Reset(delay)
	return nil
}

// SetWriteDeadline sets the write timer
func (s *stream) SetWriteDeadline(t time.Time) error {
	s.timeLock.Lock()
	defer s.timeLock.Unlock()

	s.m.Lock()
	s.writeDeadlineExceeded = false
	s.m.Unlock()
	// drain timer if it fired
	if !s.writeTimer.Stop() {
		select {
		case <-s.writeTimer.C:
		default:
		}
	}

	if t.IsZero() {
		_ = s.writeTimer.Reset(veryLongTime)
		return nil
	}

	delay := t.Sub(time.Now())
	_ = s.writeTimer.Reset(delay)
	return nil
}

func (s *stream) checkTimers() {
	for {
		s.timeLock.Lock()
		select {
		case <-s.readTimer.C:
			s.m.Lock()
			s.readDeadlineExceeded = true
			s.m.Unlock()
			s.c.Broadcast()
		case <-s.writeTimer.C:
			s.m.Lock()
			s.writeDeadlineExceeded = true
			s.m.Unlock()
			s.c.Broadcast()
		default:
		}
		s.timeLock.Unlock()
	}
}

// unblock bytes for the remote connection
func (s *stream) unblock(read uint32) {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()
	defer s.session.logger.Printf("unblock broadcasted : stream %d", s.id)
	s.unblocked += read
}

// push bytes to the buffer
func (s *stream) push(buf []byte) {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()
	defer s.session.logger.Printf("push broadcasted : stream %d", s.id)
	_, err := s.b.Write(buf)
	s.endErr = err
}

// accept stream by closing channel
func (s *stream) accept(read uint32) {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()
	s.unblocked += read

	select {
	case <-s.accepted:
	default:
		close(s.accepted)
	}
}

func (s *stream) SetDeadline(t time.Time) error {
	if err := s.SetReadDeadline(t); err != nil {
		return err
	}
	if err := s.SetWriteDeadline(t); err != nil {
		return err
	}
	return nil
}

func (s *stream) IsRemovable() bool {
	s.m.Lock()
	defer s.m.Unlock()
	return s.b.Len() == 0 && s.closed && s.remoteClosed
}

func (s *stream) setRemoteClosed() {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()
	s.remoteClosed = true
}

func (s *stream) isClosed() bool {
	s.m.Lock()
	defer s.m.Unlock()
	return s.closed
}

func (s *stream) isRemoteClosed() bool {
	s.m.Lock()
	defer s.m.Unlock()
	return s.remoteClosed
}

func (s *stream) LocalAddr() net.Addr {
	return s.session.conn.LocalAddr()
}

func (s *stream) RemoteAddr() net.Addr {
	return s.session.conn.RemoteAddr()
}

// Close closes the stream
func (s *stream) Close() error {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()

	if s.closed {
		return nil
	}

	s.closed = true
	if err := s.session.send(newFinFrame(s.id)); err != nil {
		return err
	}

	return nil
}

// Read reads bytes from the stream
func (s *stream) Read(buf []byte) (int, error) {
	s.m.Lock()
	defer s.m.Unlock()

	s.session.logger.Printf("stread %d: read requested", s.id)

	for s.b.Len() == 0 && s.endErr == nil {
		if s.remoteClosed {
			return 0, io.EOF
		}

		if s.readDeadlineExceeded {
			return 0, ErrReadTimeout
		}

		s.session.logger.Printf("stream %d: read waiting", s.id)
		s.c.Wait()
	}

	if s.endErr != nil {
		return 0, s.endErr
	}

	n, _ := s.b.Read(buf)
	if err := s.session.send(newAckFrame(s.id, uint32(n))); err != nil {
		return n, err
	}

	s.session.logger.Printf("stream %d: read completed", s.id)

	return n, nil
}

func (s *stream) Write(buf []byte) (int, error) {

	s.m.Lock()
	defer s.m.Unlock()

	w := 0
	for len(buf) > 0 {
		for s.unblocked == 0 && s.endErr == nil {
			if s.closed {
				return w, ErrBrokenPipe
			}

			if s.writeDeadlineExceeded {
				return w, ErrWriteTimeout
			}

			s.session.logger.Printf("stream %d: write waiting", s.id)
			s.c.Wait()
		}

		if s.endErr != nil {
			return w, s.endErr
		}

		cap := min(len(buf), int(s.unblocked))
		if err := s.session.send(newDataFrame(s.id, buf[:cap])); err != nil {
			return w, err
		}
		buf = buf[cap:]
		s.unblocked -= uint32(cap)
		w += cap
	}

	return w, nil
}
