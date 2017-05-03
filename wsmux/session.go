package wsmux

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/slugid-go/slugid"
)

const (
	defaultQueueSize       = 10
	defaultStreamQueueSize = 10
)

var (
	errRemoteClosed  = fmt.Errorf("remote session is no longer accepting connections")
	errAcceptTimeout = fmt.Errorf("accept timed out")
	errBrokenPipe    = fmt.Errorf("broken pipe")
)

// Session ...
type Session struct {
	streamLock sync.RWMutex

	streams    map[uint32]*Stream
	writes     chan frame
	streamChan chan *Stream

	conn     *websocket.Conn
	connLock sync.Mutex

	remoteClosed bool
	closed       bool
	nextID       uint32

	onRemoteClose  func(*Session)
	acceptDeadline time.Duration
	logger         *log.Logger
}

func newSession(conn *websocket.Conn, server uint32, onRemoteClose func(*Session)) *Session {
	s := &Session{
		streams:        make(map[uint32]*Stream),
		writes:         make(chan frame, defaultQueueSize),
		streamChan:     make(chan *Stream, defaultStreamQueueSize),
		conn:           conn,
		nextID:         server,
		onRemoteClose:  onRemoteClose,
		acceptDeadline: 30 * time.Second,
	}
	file, err := os.Create("log_session_" + slugid.Nice())
	if err != nil {
		panic(err)
	}
	s.logger = log.New(file, "session: ", log.Lshortfile)
	go s.recvLoop()
	go s.sendLoop()
	return s
}

func (s *Session) recvLoop() {
	for {
		_, msgReader, err := s.conn.NextReader()
		if err != nil {
			log.Fatal(err)
		}

		h, err := getHeader(msgReader)
		streamID, msgType := h.id(), h.msg()

		switch msgType {
		case msgSYN:
			s.streamLock.Lock()
			_, ok := s.streams[streamID]
			s.streamLock.Unlock()
			s.logger.Printf("SYN packet with id %d received", streamID)
			if ok {
				s.logger.Printf("SYN packet with id %d dropped as stream already exists", streamID)
				break
			}
			s.streamLock.Lock()
			s.streams[streamID] = newStream(streamID, s)
			s.streamLock.Unlock()
			s.logger.Printf("created stream with id %d", streamID)
			s.streamChan <- s.streams[streamID]
			s.logger.Printf("pushed stream %d to chan", streamID)

		case msgACK:
			s.streamLock.RLock()
			stream := s.streams[streamID]
			s.streamLock.RUnlock()
			if stream == nil {
				s.logger.Printf("ACK packet for unknown stream with id %d dropped", streamID)
				break
			}

			buf := make([]byte, 4)
			_, err := msgReader.Read(buf)
			if err != nil {
				s.logger.Print(err)
			} else {
				read := binary.LittleEndian.Uint32(buf)
				s.logger.Printf("received ACK packet with id %d: remote read %d bytes", streamID, read)
				stream.ack(read)
			}

		case msgFIN:
			s.streamLock.RLock()
			stream := s.streams[streamID]
			s.streamLock.RUnlock()
			if stream == nil {
				s.logger.Printf("FIN packet for unknown stream with id %d dropped", streamID)
				break
			}
			buf, err := ioutil.ReadAll(msgReader)
			s.logger.Printf("received FIN packet with id %d: remote closed connection", streamID)
			if err != nil && err != io.EOF {
				s.logger.Printf("Error reading data from FIN packet for stream %d", streamID)
				break
			}
			err = stream.addToBuffer(buf)
			if err != nil {
				s.logger.Print(err)
			}
			stream.setRemoteClosed()

		case msgDAT:
			s.streamLock.Lock()
			stream := s.streams[streamID]
			s.streamLock.Unlock()
			if stream == nil {
				s.logger.Printf("DAT packet for unknown stream with id %d dropped", streamID)
			}
			buf, err := ioutil.ReadAll(msgReader)
			err = stream.addToBuffer(buf)
			s.logger.Printf("received DAT packet with id %d: payload length %d bytes", streamID, len(buf))
			if err != nil {
				s.logger.Print(err)
			}

		// Indicates the remote session has exited and will not accept any more streams
		case msgCLS:
			s.logger.Printf("Received cls packet from remote session")
			s.remoteClosed = true
			if s.onRemoteClose != nil {
				s.onRemoteClose(s)
			}
		}

	}
}

func (s *Session) sendLoop() {
	for {
		fr := <-s.writes
		err := s.conn.WriteMessage(websocket.BinaryMessage, fr.Write())
		s.logger.Print("wrote message: ")
		s.logger.Print(bytes.NewBuffer(fr.payload).String())
		if err != nil {
			s.logger.Print(err)
		}
	}
}

// Accept ...
func (s *Session) Accept() (net.Conn, error) {
	select {
	case stream := <-s.streamChan:
		return stream, nil
	case <-time.After(s.acceptDeadline):
		return nil, errAcceptTimeout
	}
}

// Open ...
func (s *Session) Open() (net.Conn, error) {
	if s.remoteClosed {
		return nil, errRemoteClosed
	}

	atomic.AddUint32(&s.nextID, 2)
	if s.nextID == s.nextID%2 {
		_ = s.Close()
		return nil, errRemoteClosed
	}

	stream := newStream(s.nextID, s)
	s.streamLock.Lock()
	defer s.streamLock.Unlock()
	s.writes <- newSynFrame(s.nextID)
	s.streams[s.nextID] = stream
	return stream, nil
}

// Close ...
func (s *Session) Close() error {
	if s.closed {
		return errBrokenPipe
	}
	s.closed = true
	s.writes <- newClsFrame(0)
	return nil
}

func (s *Session) removeStream(id uint32) {
	s.streamLock.Lock()
	defer s.streamLock.Unlock()
	delete(s.streams, id)
}

// Addr ...
func (s *Session) Addr() net.Addr {
	return s.conn.LocalAddr()
}
