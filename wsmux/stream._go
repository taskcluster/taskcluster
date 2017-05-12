package wsmux

import (
	"io"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

// DefaultCapacity is the maximum length the read buffer will accept
const DefaultCapacity = 1024

type stream struct {
	id      uint32
	bufLock sync.Mutex // lock b of type []byte
	b       []byte

	remLock sync.Mutex
	rc      uint32 // track remote buffer capacity

	readLock  sync.Mutex // makes read operations mutually exclusive
	writeLock sync.Mutex // makes write operations mutually exclusive

	session *Session

	readDeadline  atomic.Value // stores time.Time
	writeDeadline atomic.Value // stores time.Time

	readAvailable  chan struct{}
	writeAvailable chan struct{}

	closed       chan struct{}
	remoteClosed chan struct{}

	accepted chan struct{}

	closeLock sync.Mutex
}

func newStream(id uint32, s *Session) *stream {
	str := &stream{
		id:             id,
		b:              make([]byte, 0),
		rc:             0,
		readAvailable:  make(chan struct{}, 1),
		writeAvailable: make(chan struct{}, 1),
		session:        s,
	}

	str.readDeadline.Store(time.Time{})
	str.writeDeadline.Store(time.Time{})

	str.closed = make(chan struct{})
	str.remoteClosed = make(chan struct{})

	str.accepted = make(chan struct{})
	return str
}

// LocalAddr returns local address of the stream
func (s *stream) LocalAddr() net.Addr {
	return s.session.conn.LocalAddr()
}

// RemoteAddr returns remote address of the stream
func (s *stream) RemoteAddr() net.Addr {
	return s.session.conn.RemoteAddr()
}

// SetReadDeadline sets deadline for future reads
func (s *stream) SetReadDeadline(t time.Time) error {
	s.readDeadline.Store(t)
	return nil
}

//SetWriteDeadline sets deadline for future writes
func (s *stream) SetWriteDeadline(t time.Time) error {
	s.writeDeadline.Store(t)
	return nil
}

//SetDeadline sets read and write deadlines
func (s *stream) SetDeadline(t time.Time) error {
	if err := s.SetReadDeadline(t); err != nil {
		return err
	}
	if err := s.SetWriteDeadline(t); err != nil {
		return err
	}
	return nil
}

// Read reads data from the stream
func (s *stream) Read(buf []byte) (int, error) {
	//check if stream has been accepted
	select {
	case <-s.accepted:
	default:
		return 0, ErrBrokenPipe
	}
	//check stream state
	select {
	case <-s.remoteClosed:
		s.bufLock.Lock()
		if len(s.b) == 0 {
			s.bufLock.Unlock()
			return 0, io.EOF
		}
		s.bufLock.Unlock()
	default:
	}

	select {
	case <-s.readAvailable:
	default:
	}

	s.session.logger.Printf("read attempted on stream %d", s.id)

	//lock the read
	s.readLock.Lock()
	defer s.readLock.Unlock()

	// if empty wait
	s.bufLock.Lock()
	s.session.logger.Printf("read on stream %d acquired bufLock", s.id)
	l := len(s.b)
	s.session.logger.Printf("read on stream %d read buffer capacity: %d bytes", s.id, l)
	s.bufLock.Unlock()
	if l == 0 {
		// wait
		s.session.logger.Printf("read on stream %d waiting", s.id)
		var timeout <-chan time.Time
		var timer *time.Timer
		if rd := s.readDeadline.Load().(time.Time); !rd.IsZero() {
			timer = time.NewTimer(rd.Sub(time.Now()))
			timeout = timer.C
		}
		select {
		case <-timeout:
			return 0, ErrReadTimeout
		case <-s.readAvailable:
			s.session.logger.Printf("read on stream %d can read", s.id)
			if timer != nil {
				_ = timer.Stop()
			}
		// Remote will not send any more data
		case <-s.remoteClosed:
			s.session.logger.Printf("stream %d remote closed connection", s.id)
			return 0, io.EOF
		}
	}

	// read data
	s.bufLock.Lock()
	m := copy(buf, s.b)
	s.b = s.b[m:]
	s.bufLock.Unlock()
	fr := newAckFrame(s.id, uint32(m))
	if err := s.session.send(fr); err != nil {
		return m, ErrBrokenPipe
	}
	s.session.logger.Printf("read on stream %d wrote ack frame: %d bytes read", s.id, m)
	return m, nil
}

// Write writes data to the stream
func (s *stream) Write(buf []byte) (int, error) {
	select {
	case <-s.accepted:
	default:
		return 0, ErrBrokenPipe
	}
	s.session.logger.Printf("requested write %d", len(buf))
	// check if stream closed
	select {
	case <-s.closed:
		return 0, ErrBrokenPipe
	default:
	}

	// check remote capacity
	s.writeLock.Lock()
	defer s.writeLock.Unlock()
	l, w := len(buf), 0
	s.session.logger.Printf("write on stream %d acquired lock", s.id)
	for w < l {
		select {
		case <-s.writeAvailable:
		default:
		}
		s.remLock.Lock()
		rc := s.rc
		s.session.logger.Printf("write on stream %d read remote capacity: %d bytes", s.id, rc)
		s.remLock.Unlock()
		if rc == 0 {
			// wait
			var timeout <-chan time.Time
			var timer *time.Timer
			if rd := s.readDeadline.Load().(time.Time); !rd.IsZero() {
				timer = time.NewTimer(rd.Sub(time.Now()))
				timeout = timer.C
			}
			s.session.logger.Printf("write on stream %d waiting", s.id)

			select {
			case <-timeout:
				return w, ErrWriteTimeout
			case <-s.writeAvailable:
				s.session.logger.Printf("write on stream %d can write", s.id)
				if timer != nil {
					timer.Stop()
				}
			case <-s.closed:
				return w, ErrBrokenPipe
			}
		}
		// write
		s.remLock.Lock()
		s.session.logger.Printf("write on stream %d acquired remLock", s.id)
		cap := min(len(buf), int(s.rc))

		fr := newDataFrame(s.id, buf[:cap])
		if err := s.session.send(fr); err != nil {
			s.remLock.Unlock()
			return w, ErrBrokenPipe
		}
		s.session.logger.Printf("write on stream %d wrote frame", s.id)

		buf = buf[cap:]
		s.rc -= uint32(cap)
		w += cap
		s.remLock.Unlock()
	}
	return w, nil
}

// Close is used to close the stream
func (s *stream) Close() error {
	s.closeLock.Lock()
	defer s.closeLock.Unlock()

	// check to see if closed
	select {
	case <-s.closed:
		return ErrBrokenPipe
	default:
	}

	defer close(s.closed)

	// write fin frame and close
	if err := s.session.send(newFinFrame(s.id)); err != nil {
		return err
	}

	return nil
}

func (s *stream) updateRemoteCapacity(read uint32) {
	s.remLock.Lock()
	if s.rc < 1024 {
		s.rc += read
	}
	s.remLock.Unlock()
	s.session.logger.Printf("updated capacity by %d bytes", read)
	s.notifyWrite()
}

func (s *stream) addToBuffer(buf []byte) {
	s.bufLock.Lock()
	defer s.bufLock.Unlock()
	s.b = append(s.b, buf...)
	s.notifyRead()
}

func (s *stream) notifyRead() {
	select {
	case s.readAvailable <- struct{}{}:
		s.session.logger.Printf("notified read")
	default:
	}
}

func (s *stream) notifyWrite() {
	select {
	case s.writeAvailable <- struct{}{}:
		s.session.logger.Printf("notified write")
	default:
	}
}

func (s *stream) setRemoteClosed() error {
	s.closeLock.Lock()
	defer s.closeLock.Unlock()

	// check to see if remote was previously closed
	select {
	case <-s.remoteClosed:
		return ErrBrokenPipe
	default:
	}

	close(s.remoteClosed)

	return nil
}

func (s *stream) accept(read uint32) {
	s.remLock.Lock()
	defer s.remLock.Unlock()
	s.rc = read
	close(s.accepted)
	s.notifyWrite()
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

func (s *stream) getBufLen() int {
	s.bufLock.Lock()
	defer s.bufLock.Unlock()
	return len(s.b)
}
