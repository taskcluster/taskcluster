package wsmux

import (
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
	bc      uint32 // buffer length. Use atomics
	rc      uint32 // track remote buffer capacity

	readLock  sync.Mutex // makes read operations mutually exclusive
	writeLock sync.Mutex // makes write operations mutually exclusive

	session *Session

	readDeadline  time.Time
	writeDeadline time.Time

	readWaiting  atomic.Value
	writeWaiting atomic.Value

	readAvaliable  chan struct{}
	writeAvailable chan struct{}

	closed       atomic.Value
	remoteClosed atomic.Value
}

func newStream(id uint32, s *Session) *stream {
	str := &stream{
		id:      id,
		b:       make([]byte, 0),
		bc:      0,
		rc:      DefaultCapacity,
		session: s,
	}

	str.readAvaliable = make(chan struct{}, 1)
	str.writeAvailable = make(chan struct{}, 1)
	str.readWaiting.Store(false)
	str.writeWaiting.Store(false)
	str.closed.Store(false)
	str.remoteClosed.Store(false)
	return str
}

func (s *stream) LocalAddr() net.Addr {
	return s.session.conn.LocalAddr()
}

func (s *stream) RemoteAddr() net.Addr {
	return s.session.conn.RemoteAddr()
}

func (s *stream) SetReadDeadline(t time.Time) error {
	s.readDeadline = t
	return nil
}

func (s *stream) SetWriteDeadline(t time.Time) error {
	s.writeDeadline = t
	return nil
}

func (s *stream) SetDeadline(t time.Time) error {
	s.readDeadline = t
	s.writeDeadline = t
	return nil
}

func (s *stream) Read(buf []byte) (int, error) {
	s.readLock.Lock()
	defer s.readLock.Unlock()
	if atomic.LoadUint32(&s.bc) == 0 {
		s.readWaiting.Store(true)
		// wait
		var timeout <-chan time.Time
		if !s.readDeadline.IsZero() {
			timer := time.NewTimer(s.readDeadline.Sub(time.Now()))
			defer timer.Stop()
			timeout = timer.C
		}

		select {
		case <-timeout:
			s.readWaiting.Store(false)
			return 0, ErrReadTimeout
		case <-s.readAvaliable:
			s.readWaiting.Store(false)
		}
	}
	m := copy(buf, s.b)
	s.b = s.b[m:]
	atomic.AddUint32(&s.bc, ^uint32(m-1))
	s.session.writes <- newAckFrame(s.id, uint32(m))
	return m, nil
}

func (s *stream) Write(buf []byte) (int, error) {
	s.writeLock.Lock()
	defer s.writeLock.Unlock()

	l, written := len(buf), 0
	for l != written {
		// remote has no capacity
		if atomic.LoadUint32(&s.rc) == 0 {
			// wait
			s.writeWaiting.Store(true)
			var timeout <-chan time.Time
			if !s.writeDeadline.IsZero() {
				timer := time.NewTimer(s.writeDeadline.Sub(time.Now()))
				defer timer.Stop()
				timeout = timer.C
			}

			select {
			case <-timeout:
				s.writeWaiting.Store(false)
				return written, ErrWriteTimeout
			case <-s.writeAvailable:
			}
		}
		rc := int(atomic.LoadUint32(&s.rc))
		cap := min(len(buf), rc)
		b := buf[:cap]
		buf = buf[cap:]
		s.session.writes <- newDataFrame(s.id, b)
		atomic.AddUint32(&s.rc, ^uint32(cap-1))
		written += cap
	}
	return written, nil
}

func (s *stream) Close() error {
	if s.closed.Load() == true {
		return ErrBrokenPipe
	}
	s.closed.Store(true)
	if s.remoteClosed.Load() == true {
		s.session.removeStream(s.id)
	}
	return nil
}

func (s *stream) addToBuffer(buf []byte) error {
	s.bufLock.Lock()
	defer s.bufLock.Unlock()
	if atomic.LoadUint32(&s.bc)+uint32(len(buf)) > DefaultCapacity {
		return ErrBufferFull
	}
	s.b = append(s.b, buf...)
	atomic.AddUint32(&s.bc, uint32(len(buf)))
	if s.readWaiting.Load() == true {
		s.readAvaliable <- struct{}{}
	}
	return nil
}

func (s *stream) ack(read uint32) {
	atomic.AddUint32(&s.rc, read)
	if s.writeWaiting.Load() == true {
		s.writeAvailable <- struct{}{}
	}
}

func (s *stream) setRemoteClosed() {
	s.remoteClosed.Store(true)
	if s.closed.Load() == true {
		s.session.removeStream(s.id)
	}
}
