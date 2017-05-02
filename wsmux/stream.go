package wsmux

import (
	"fmt"
	"io"
	"net"
	"sync"
	"time"
)

// DefaultCapacity is the maximum length the read buffer will accept
const DefaultCapacity = 1024

var (
	// errWriteTimeout is returned if no ack frame arrives before the duration.
	errWriteTimeout = fmt.Errorf("write operation timed out")

	// errReadTimeout
	errReadTimeout = fmt.Errorf("read operation timed out")

	// errBufferFull
	errBufferFull = fmt.Errorf("read buffer is full")
)

// Stream ...
type Stream struct {
	id uint32

	rb       []byte
	readLock sync.Mutex

	capLock        sync.Mutex
	remoteCapacity int

	writeChan chan frame

	ackCond  *sync.Cond
	readCond *sync.Cond

	remoteClosed bool
	closed       bool

	writeDeadline time.Time
	readDeadline  time.Time

	session *Session
}

func newStream(id uint32, writeChan chan frame, session *Session) *Stream {
	stream := &Stream{
		id:             id,
		rb:             make([]byte, 0),
		writeChan:      writeChan,
		remoteCapacity: DefaultCapacity,
		writeDeadline:  time.Now().Add(time.Second * 30),
		readDeadline:   time.Now().Add(time.Second * 30),
	}
	stream.ackCond = sync.NewCond(&stream.capLock)
	stream.readCond = sync.NewCond(&stream.readLock)
	stream.session = session
	return stream
}

func (s *Stream) ack(read uint32) {
	defer s.ackCond.Signal()
	s.capLock.Lock()
	s.remoteCapacity += int(read)
	s.capLock.Unlock()
}

func (s *Stream) write(buf []byte) error {
	defer s.readCond.Signal()
	s.readLock.Lock()
	if len(s.rb)+len(buf) > DefaultCapacity {
		return errBufferFull
	}
	s.rb = append(s.rb, buf...)
	s.readLock.Unlock()
	return nil
}

func (s *Stream) setRemoteClosed() {
	s.remoteClosed = true
	if s.closed {
		s.session.removeStream(s.id)
	}
}

func (s *Stream) waitForAck() <-chan struct{} {
	signal := make(chan struct{}, 1)
	go func() {
		s.ackCond.Wait()
		signal <- struct{}{}
	}()
	return signal
}

func (s *Stream) waitForData() <-chan struct{} {
	signal := make(chan struct{}, 1)
	go func() {
		s.readCond.Wait()
		signal <- struct{}{}
	}()
	return signal
}

/*
Write is used to write bytes to the stream
*/
func (s *Stream) Write(buf []byte) (int, error) {
	// Trivial Case: len of buffer is less than capacity of remote buffer
	// No need to wait for an ack packet in this case
	s.capLock.Lock()
	defer s.capLock.Unlock()

	if s.closed {
		return 0, errBrokenPipe
	}

	// Length of buffer is greater than remoteCapacity
	l, written := len(buf), 0
	for written != l {
		// If remote capacity is zero, wait for an ack packet
		if s.remoteCapacity == 0 {
			var timeout <-chan time.Time
			if !s.writeDeadline.IsZero() {
				timeout = time.After(s.writeDeadline.Sub(time.Now()))
			}
			select {
			case <-timeout:
				// caplock would be unlocked by Wait in waitForAck
				// lock before returning
				s.capLock.Lock()
				return written, errWriteTimeout
			case <-s.waitForAck():
			}
		}
		cap := min(len(buf), s.remoteCapacity)
		frame := newDataFrame(s.id, buf[:cap])
		buf = buf[cap:]
		s.writeChan <- frame
		written += cap
		s.remoteCapacity -= cap
	}
	return l, nil
}

// Read ...
func (s *Stream) Read(buf []byte) (int, error) {
	s.readLock.Lock()
	defer s.readLock.Unlock()

	if len(s.rb) == 0 {
		if s.remoteClosed {
			return 0, io.EOF
		}
		var timeout <-chan time.Time
		if !s.readDeadline.IsZero() {
			timeout = time.After(s.readDeadline.Sub(time.Now()))
		}
		select {
		case <-timeout:
			// Mutex unlocked by wait call from waitForData()
			// Lock before return
			s.readLock.Lock()
			return 0, errReadTimeout
		case <-s.waitForData():
		}
	}
	m := copy(buf, s.rb)
	s.rb = s.rb[m:]
	s.writeChan <- newAckFrame(s.id, uint32(m))
	return m, nil
}

// Close ...
func (s *Stream) Close() error {
	if s.closed {
		return errBrokenPipe
	}
	s.closed = true
	s.writeChan <- newFinFrame(s.id, nil)
	if s.remoteClosed {
		s.session.removeStream(s.id)
	}
	return nil
}

// SetReadDeadline ...
func (s *Stream) SetReadDeadline(t time.Time) error {
	s.readDeadline = t
	return nil
}

// SetWriteDeadline ...
func (s *Stream) SetWriteDeadline(t time.Time) error {
	s.writeDeadline = t
	return nil
}

// SetDeadline ...
func (s *Stream) SetDeadline(t time.Time) error {
	if err := s.SetReadDeadline(t); err != nil {
		return err
	}
	if err := s.SetWriteDeadline(t); err != nil {
		return err
	}
	return nil
}

// LocalAddr ...
func (s *Stream) LocalAddr() net.Addr {
	return s.session.conn.LocalAddr()
}

// RemoteAddr ...
func (s *Stream) RemoteAddr() net.Addr {
	return s.session.conn.RemoteAddr()
}
