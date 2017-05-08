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
	bc      uint32 // buffer length. Use atomics
	rc      uint32 // track remote buffer capacity

	readLock  sync.Mutex // makes read operations mutually exclusive
	writeLock sync.Mutex // makes write operations mutually exclusive

	session *Session

	readDeadline  atomic.Value // stores time.Time
	writeDeadline atomic.Value // stores time.Time

	readWaiting  atomic.Value // stores bool
	writeWaiting atomic.Value // stores bool

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
	str.readDeadline.Store(time.Time{})
	str.writeDeadline.Store(time.Time{})
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
	s.readDeadline.Store(t)
	return nil
}

func (s *stream) SetWriteDeadline(t time.Time) error {
	s.writeDeadline.Store(t)
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

func (s *stream) Read(buf []byte) (int, error) {
	s.readLock.Lock()
	defer s.readLock.Unlock()
	if atomic.LoadUint32(&s.bc) == 0 {
		if s.remoteClosed.Load() == true {
			return 0, io.EOF
		}
		s.readWaiting.Store(true)
		// wait
		var timeout <-chan time.Time
		if rd := s.readDeadline.Load().(time.Time); !rd.IsZero() {
			timer := time.NewTimer(rd.Sub(time.Now()))
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
	s.bufLock.Lock()
	defer s.bufLock.Unlock()
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
		if s.closed.Load() == true {
			return written, ErrBrokenPipe
		}
		// remote has no capacity
		if atomic.LoadUint32(&s.rc) == 0 {
			// wait
			s.writeWaiting.Store(true)
			var timeout <-chan time.Time
			if wd := s.writeDeadline.Load().(time.Time); !wd.IsZero() {
				timer := time.NewTimer(wd.Sub(time.Now()))
				defer timer.Stop()
				timeout = timer.C
			}

			select {
			case <-timeout:
				s.writeWaiting.Store(false)
				return written, ErrWriteTimeout
			case <-s.writeAvailable:
				s.writeWaiting.Store(false)
			}
		}
		rc := int(atomic.LoadUint32(&s.rc))
		cap := min(len(buf), rc)
		b := buf[:cap]
		buf = buf[cap:]
		fr := newDataFrame(s.id, b)
		s.session.writes <- fr
		atomic.AddUint32(&s.rc, ^uint32(cap-1))
		written += cap
		s.session.logger.Printf("stream %d pushed to write chan %v", s.id, fr)
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
		s.session.logger.Printf("should signal read available")
		s.readAvaliable <- struct{}{}
		s.session.logger.Printf("signalled read available")
	}
	return nil
}

func (s *stream) ack(read uint32) {
	atomic.AddUint32(&s.rc, read)
	if s.writeWaiting.Load() == true {
		s.session.logger.Printf("should signal write available")
		s.writeAvailable <- struct{}{}
		s.session.logger.Printf("signalled write available")
	} else {
		s.session.logger.Printf("no write waiting")
	}
}

func (s *stream) setRemoteClosed() {
	s.remoteClosed.Store(true)
	if s.closed.Load() == true {
		s.session.removeStream(s.id)
	}
}
