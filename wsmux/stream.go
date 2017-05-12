package wsmux

import (
	"bytes"
	"io"
	"net"
	"sync"
	"time"
)

const (
	DefaultCapacity = 128
)

type stream struct {
	id        uint32
	m         sync.Mutex
	c         *sync.Cond
	b         *buffer
	unblocked uint32

	endErr error

	closed       chan struct{}
	remoteClosed chan struct{}
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

		closed:       make(chan struct{}),
		remoteClosed: make(chan struct{}),
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
	s.unblocked += read
	s.session.logger.Printf("unblock broadcasted : stream %d", s.id)
}

func (s *stream) push(buf []byte) {
	s.m.Lock()
	defer s.m.Unlock()
	defer s.c.Broadcast()
	_, err := s.b.Write(buf)
	s.endErr = err
	s.session.logger.Printf("push broadcasted : stream %d", s.id)
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
	select {
	case <-s.remoteClosed:
	default:
		close(s.remoteClosed)
	}
}

func (s *stream) isClosed() bool {
	select {
	case <-s.closed:
		return true
	default:
	}
	return false
}

func (s *stream) isRemoteClosed() bool {
	select {
	case <-s.remoteClosed:
		return true
	default:
	}
	return false
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

	select {
	case <-s.closed:
		return nil
	default:
	}

	defer close(s.closed)

	if err := s.session.send(newFinFrame(s.id)); err != nil {
		return err
	}

	return nil
}

// Read reads bytes from the stream
func (s *stream) Read(buf []byte) (int, error) {
	s.m.Lock()
	defer s.m.Unlock()

	timeout, timer := getTimeoutAndTimer(s.readDeadline)
	for s.b.Len() == 0 && s.endErr == nil {
		select {
		case <-s.remoteClosed:
			return 0, io.EOF
		case <-timeout:
			return 0, ErrReadTimeout
		default:
		}
		s.c.Wait()
	}
	if timer != nil {
		_ = timer.Stop()
	}

	if s.endErr != nil {
		return 0, s.endErr
	}

	n, _ := s.b.Read(buf)
	if err := s.session.send(newAckFrame(s.id, uint32(n))); err != nil {
		return n, err
	}

	return n, nil
}

func (s *stream) Write(buf []byte) (int, error) {

	s.m.Lock()
	defer s.m.Unlock()

	l, w := len(buf), 0
	for w < l {
		timeout, timer := getTimeoutAndTimer(s.writeDeadline)
		for s.unblocked == 0 && s.endErr == nil {
			select {
			case <-s.closed:
				return w, ErrBrokenPipe
			case <-timeout:
				return w, ErrWriteTimeout
			default:
			}
			s.session.logger.Printf("stream %d: write waiting")
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
		s.session.logger.Printf("stream %d: wrote %s", s.id, bytes.NewBuffer(buf[:cap]))
		buf = buf[cap:]
		s.unblocked -= uint32(cap)
		w += cap
	}

	return w, nil
}
