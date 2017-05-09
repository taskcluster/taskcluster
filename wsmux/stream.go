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

	closeLock sync.Mutex
}

func newStream(id uint32, s *Session) *stream {
	str := &stream{
		id:             id,
		b:              make([]byte, 0),
		rc:             DefaultCapacity,
		readAvailable:  make(chan struct{}, 1),
		writeAvailable: make(chan struct{}, 1),
		session:        s,
	}

	str.readDeadline.Store(time.Time{})
	str.writeDeadline.Store(time.Time{})
	str.closed = make(chan struct{})
	str.remoteClosed = make(chan struct{})

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

	//lock the read
	s.readLock.Lock()
	defer s.readLock.Unlock()

	// if empty wait
	s.bufLock.Lock()
	l := len(s.b)
	s.bufLock.Unlock()
	if l == 0 {
		// wait
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
			if timer != nil {
				_ = timer.Stop()
			}
		// Remote will not send any more data
		case <-s.remoteClosed:
			return 0, io.EOF
		}
	}

	// read data
	s.bufLock.Lock()
	m := copy(buf, s.b)
	s.b = s.b[m:]
	s.bufLock.Unlock()
	s.session.writes <- newAckFrame(s.id, uint32(m))
	return m, nil
}

// Write writes data to the stream
func (s *stream) Write(buf []byte) (int, error) {
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
	for w < l {
		if rc := atomic.LoadUint32(&s.rc); rc == 0 {
			// wait
			var timeout <-chan time.Time
			var timer *time.Timer
			if rd := s.readDeadline.Load().(time.Time); !rd.IsZero() {
				timer = time.NewTimer(rd.Sub(time.Now()))
				timeout = timer.C
			}
			select {
			case <-timeout:
				return w, ErrWriteTimeout
			case <-s.writeAvailable:
				if timer != nil {
					timer.Stop()
				}
			case <-s.closed:
				return w, ErrBrokenPipe
			}
		}
		// write
		cap := min(len(buf), int(atomic.LoadUint32(&s.rc)))
		s.session.writes <- newDataFrame(s.id, buf[:cap])
		buf = buf[cap:]
		atomic.AddUint32(&s.rc, ^uint32(cap-1))
		w += cap
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

	// write fin frame and close
	select {
	case s.session.writes <- newFinFrame(s.id):
	default:
	}
	close(s.closed)

	select {
	case <-s.remoteClosed:
		defer s.session.removeStream(s.id)
	default:
	}

	return nil
}

func (s *stream) updateRemoteCapacity(read uint32) {
	atomic.AddUint32(&s.rc, read)
}

func (s *stream) addToBuffer(buf []byte) {
	s.bufLock.Lock()
	defer s.bufLock.Unlock()
	s.b = append(s.b, buf...)
}

func (s *stream) notifyRead() {
	select {
	case s.readAvailable <- struct{}{}:
	default:
	}
}

func (s *stream) notifyWrite() {
	select {
	case s.writeAvailable <- struct{}{}:
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

	select {
	case <-s.closed:
		defer s.session.removeStream(s.id)
	default:
	}
	return nil
}
