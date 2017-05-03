package wsmux

import (
	"fmt"
	"io"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

// DefaultCapacity is the maximum length the read buffer will accept
const DefaultCapacity = 1024

var (
	// errWriteTimeout is returned if no ack frame arrives before the duration.
	errWriteTimeout = fmt.Errorf("wsmux: write operation timed out")

	// errReadTimeout
	errReadTimeout = fmt.Errorf("wsmux: read operation timed out")

	// errBufferFull
	errBufferFull = fmt.Errorf("read buffer is full")
)

// stream ...
type stream struct {
	// Locks
	// readLock is used to make sure Read operations are mutually exclusive
	readLock sync.Mutex
	// writeLock is used to ensure that Write operations are mutually exclusive
	writeLock sync.Mutex
	// readTimeLock is passed to the the readCond conditional
	readTimeLock sync.Mutex
	// writeTimeLock is passed to the writeCond conditional
	writeTimeLock sync.Mutex
	// bufLock locks the read buffer rb
	bufLock sync.Mutex

	id uint32

	// rb is the read buffer
	rb []byte
	// bufLen stores the number of bytes in the read buffer
	// use atomic to manipulate
	bufLen uint32

	// remoteCapacity is modified using atomic
	remoteCapacity uint32

	writeCond *sync.Cond
	readCond  *sync.Cond

	remoteClosed bool
	closed       bool

	writeDeadline time.Duration
	readDeadline  time.Duration

	session *Session
}

func newStream(id uint32, session *Session) *stream {
	str := &stream{
		id:             id,
		rb:             make([]byte, 0),
		remoteCapacity: DefaultCapacity,
		writeDeadline:  30 * time.Second,
		readDeadline:   30 * time.Second,
	}
	str.writeCond = sync.NewCond(&str.writeTimeLock)
	str.readCond = sync.NewCond(&str.readTimeLock)
	str.session = session
	return str
}

func (s *stream) ack(read uint32) {
	defer s.writeCond.Signal()
	atomic.AddUint32(&s.remoteCapacity, read)
}

func (s *stream) addToBuffer(buf []byte) error {
	defer s.readCond.Signal()
	defer s.bufLock.Unlock()
	s.bufLock.Lock()
	if len(s.rb)+len(buf) > DefaultCapacity {
		return errBufferFull
	}
	s.rb = append(s.rb, buf...)
	atomic.AddUint32(&s.bufLen, uint32(len(buf)))
	return nil
}

func (s *stream) setRemoteClosed() {
	s.remoteClosed = true
	if s.closed {
		s.session.removeStream(s.id)
	}
}

/*
Write is used to write bytes to the stream
*/
func (s *stream) Write(buf []byte) (int, error) {
	s.writeLock.Lock()
	defer s.writeLock.Unlock()

	// Length of buffer is greater than remoteCapacity
	l, written := len(buf), 0
	timeout := false
	timer := time.AfterFunc(30*time.Second, func() {
		timeout = true
		s.writeCond.Signal()
	})
	defer func() {
		_ = timer.Stop()
	}()
	for written != l {
		if s.closed {
			return written, errBrokenPipe
		}
		if timeout {
			return written, errWriteTimeout
		}
		// If remote capacity is zero, wait for an ack packet
		if atomic.LoadUint32(&s.remoteCapacity) == 0 {
			s.writeTimeLock.Lock()
			s.writeCond.Wait()
			s.writeTimeLock.Unlock()
			if timeout {
				return written, errWriteTimeout
			}
		}
		cap := min(len(buf), int(atomic.LoadUint32(&s.remoteCapacity)))
		fr := newDataFrame(s.id, buf[:cap])
		buf = buf[cap:]
		s.session.writes <- fr
		written += cap
		atomic.AddUint32(&s.remoteCapacity, ^uint32(cap-1))
	}
	return l, nil
}

// Read ...
func (s *stream) Read(buf []byte) (int, error) {
	s.readLock.Lock()
	defer s.readLock.Unlock()

	timeout := false
	timer := time.AfterFunc(30*time.Second, func() {
		timeout = true
		s.readCond.Signal()
	})
	defer func() {
		_ = timer.Stop()
	}()

	if atomic.LoadUint32(&s.bufLen) == 0 {
		if s.remoteClosed {
			return 0, io.EOF
		}
		s.readTimeLock.Lock()
		s.readCond.Wait()
		s.readTimeLock.Unlock()
		if timeout == true {
			return 0, errReadTimeout
		}

	}
	s.bufLock.Lock()
	defer s.bufLock.Unlock()
	m := copy(buf, s.rb)
	s.rb = s.rb[m:]
	atomic.AddUint32(&s.bufLen, ^uint32(m-1))
	s.session.writes <- newAckFrame(s.id, uint32(m))
	return m, nil
}

// Close ...
func (s *stream) Close() error {
	if s.closed {
		return errBrokenPipe
	}
	s.closed = true
	s.session.writes <- newFinFrame(s.id)
	if s.remoteClosed {
		s.session.removeStream(s.id)
	}
	return nil
}

// SetReadDeadline ...
func (s *stream) SetReadDeadline(t time.Time) error {
	s.readDeadline = t.Sub(time.Now())
	return nil
}

// SetWriteDeadline ...
func (s *stream) SetWriteDeadline(t time.Time) error {
	s.writeDeadline = t.Sub(time.Now())
	return nil
}

// SetDeadline ...
func (s *stream) SetDeadline(t time.Time) error {
	if err := s.SetReadDeadline(t); err != nil {
		return err
	}
	if err := s.SetWriteDeadline(t); err != nil {
		return err
	}
	return nil
}

// LocalAddr ...
func (s *stream) LocalAddr() net.Addr {
	return s.session.conn.LocalAddr()
}

// RemoteAddr ...
func (s *stream) RemoteAddr() net.Addr {
	return s.session.conn.RemoteAddr()
}
