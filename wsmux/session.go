package wsmux

import (
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

	streams    map[uint32]*stream
	writes     chan frame
	streamChan chan *stream

	conn     *websocket.Conn
	connLock sync.Mutex

	remoteClosed bool
	closed       bool
	nextID       uint32

	RemoteCloseCallback func()
	acceptDeadline      time.Duration
	logger              *log.Logger
}

/*
newSession creates a new session over a gorilla websocket connection

if server == true then nextID = 0
else nextID = 1
This ensures that server and client do not accidentally open a new connection with
the same ID

*/

func newSession(conn *websocket.Conn, server bool, conf *Config) *Session {
	if conf == nil {
		conf = &Config{}
	}
	nextID := uint32(1)
	if server {
		nextID = 0
	}
	s := &Session{
		streams:             make(map[uint32]*stream),
		writes:              make(chan frame, defaultQueueSize),
		streamChan:          make(chan *stream, defaultStreamQueueSize),
		conn:                conn,
		nextID:              nextID,
		RemoteCloseCallback: conf.RemoteCloseCallback,
		acceptDeadline:      30 * time.Second,
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
			str := s.streams[streamID]
			s.streamLock.RUnlock()
			if str == nil {
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
				str.ack(read)
			}

		case msgFIN:
			s.streamLock.RLock()
			str := s.streams[streamID]
			s.streamLock.RUnlock()
			if str == nil {
				s.logger.Printf("FIN packet for unknown stream with id %d dropped", streamID)
				break
			}
			buf, err := ioutil.ReadAll(msgReader)
			s.logger.Printf("received FIN packet with id %d: remote closed connection", streamID)
			if err != nil && err != io.EOF {
				s.logger.Printf("Error reading data from FIN packet for stream %d", streamID)
				break
			}
			err = str.addToBuffer(buf)
			if err != nil {
				s.logger.Print(err)
			}
			str.setRemoteClosed()

		case msgDAT:
			s.streamLock.Lock()
			str := s.streams[streamID]
			s.streamLock.Unlock()
			if str == nil {
				s.logger.Printf("DAT packet for unknown stream with id %d dropped", streamID)
			}
			buf, err := ioutil.ReadAll(msgReader)
			err = str.addToBuffer(buf)
			s.logger.Printf("received DAT packet with id %d: payload length %d bytes", streamID, len(buf))
			if err != nil {
				s.logger.Print(err)
			}

		// Indicates the remote session has exited and will not accept any more streams
		case msgCLS:
			s.logger.Printf("Received cls packet from remote session")
			s.remoteClosed = true
			if s.RemoteCloseCallback != nil {
				s.RemoteCloseCallback()
			}
		}

	}
}

func (s *Session) sendLoop() {
	for fr := range s.writes {
		err := s.conn.WriteMessage(websocket.BinaryMessage, fr.Write())
		s.logger.Print("wrote message: ")
		s.logger.Print(fr)
		if err != nil {
			s.logger.Print(err)
		}
	}
}

// Accept ...
func (s *Session) Accept() (net.Conn, error) {
	select {
	case str := <-s.streamChan:
		return str, nil
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

	str := newStream(s.nextID, s)
	s.streamLock.Lock()
	defer s.streamLock.Unlock()
	s.writes <- newSynFrame(s.nextID)
	s.streams[s.nextID] = str
	return str, nil
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
