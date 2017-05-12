package wsmux

import (
	"bytes"
	"io"
	"net"
	"sync"
	"time"
)

const (
	DefaultCapacity = 1024
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

	//deadlines
	writeDeadline time.Time
	readDeadline  time.Time
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

		session: session,
	}

	str.c = sync.NewCond(&str.m)
	return str
}

func (s *stream) unblock(read uint32) {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()
	defer s.session.logger.Printf("unblock broadcasted : stream %d", s.id)
	s.unblocked += read
}

func (s *stream) push(buf []byte) {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()
	defer s.session.logger.Printf("push broadcasted : stream %d", s.id)
	_, err := s.b.Write(buf)
	s.endErr = err
}

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

func (s *stream) getBufLen() int {
	s.m.Lock()
	defer s.m.Unlock()
	return s.b.Len()
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

func (s *stream) SetReadDeadline(t time.Time) error {
	s.m.Lock()
	defer s.m.Unlock()
	s.readDeadline = t
	return nil
}

func (s *stream) SetWriteDeadline(t time.Time) error {
	s.m.Lock()
	defer s.m.Unlock()
	s.writeDeadline = t
	return nil
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

// Close closes the stream
func (s *stream) Close() error {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()

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

	timeout, timer := getTimeoutAndTimer(s.readDeadline)
	for s.b.Len() == 0 && s.endErr == nil {
		if s.remoteClosed {
			return 0, io.EOF
		}

		select {
		case <-timeout:
			return 0, ErrReadTimeout
		default:
		}

		s.session.logger.Printf("stream %d: read waiting", s.id)
		s.session.logger.Printf("stread %d : s.b.s: %d s.b.e: %d", s.id, s.b.s, s.b.e)
		s.c.Wait()
	}

	if timer != nil {
		_ = timer.Stop()
	}

	if s.endErr != nil {
		return 0, s.endErr
	}

	n, _ := s.b.Read(buf)
	s.session.logger.Printf("read bytes %d: %s", n, bytes.NewBuffer(buf).String())
	buf = buf[:n]
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
		timeout, timer := getTimeoutAndTimer(s.writeDeadline)
		for s.unblocked == 0 && s.endErr == nil {
			if s.closed {
				return w, ErrBrokenPipe
			}

			select {
			case <-timeout:
				return w, ErrWriteTimeout
			default:
			}

			s.session.logger.Printf("stream %d: write waiting", s.id)
			s.c.Wait()
		}

		if timer != nil {
			_ = timer.Stop()
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
