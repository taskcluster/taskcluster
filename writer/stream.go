package writer

import (
	"fmt"
	"io"
	"io/ioutil"
	"os"

	. "github.com/visionmedia/go-debug"
	"gopkg.in/fatih/set.v0"
)

const READ_BUFFER_SIZE = 16 * 1024 // XXX: 16kb chosen at random
const MAX_PENDING_WRITE = 30       // XXX: 30 is chosen at random

type Event struct {
	Err    error
	Bytes  *[]byte
	Length int
	End    bool
	Offset int
}

type Stream struct {
	Offset  int
	Reader  *io.Reader
	File    os.File
	Ended   bool
	Reading bool

	debug  DebugFunction
	debugR DebugFunction

	handles *set.Set
}

func NewStream(read io.Reader) (*Stream, error) {
	dir, err := ioutil.TempDir("", "continuous-log-serve")
	if err != nil {
		return nil, err
	}

	path := fmt.Sprintf(dir + "/stream")

	file, openErr :=
		os.OpenFile(path, os.O_APPEND|os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0666)

	if openErr != nil {
		return nil, openErr
	}

	return &Stream{
		Offset:  0,
		Reader:  &read,
		Reading: false,
		Ended:   false,
		File:    *file,

		handles: set.New(),
		debug:   Debug("stream:control"),
		debugR:  Debug("stream:read"),
	}, nil
}

func (self *Stream) Unobserve(handle *StreamHandle) {
	self.debug("unobserve")
	self.handles.Remove(handle)
}

func (self *Stream) Observe() *StreamHandle {
	// Buffering the channel is very important to avoid writing blocks, etc..
	events := make(chan *Event, MAX_PENDING_WRITE)

	handle := StreamHandle{
		Offset: 0,
		Path:   self.File.Name(),

		abort:  make(chan error, 1), // must be buffered
		events: events,
	}

	self.handles.Add(&handle)
	return &handle
}

func (self *Stream) Consume() error {
	self.debug("consume")
	if self.Reading {
		return fmt.Errorf("Cannot consome twice...")
	}

	defer func() {
		self.debug("consume cleanup...")

		self.File.Close()

		// Cleanup all handles after the consumption is complete...
		self.debug("removing %d handles", self.handles.Size())
		self.handles.Clear()
	}()

	tee := io.TeeReader(*self.Reader, &self.File)
	for {
		buf := make([]byte, READ_BUFFER_SIZE)
		bytesRead, readErr := tee.Read(buf)
		self.debugR("reading bytes %d", bytesRead)

		if bytesRead > 0 {
			self.Offset += bytesRead
		}

		eof := readErr == io.EOF

		// EOF in this context should not be sent as an event error it is handled in
		// the .End case...
		var eventErr error
		if !eof && readErr != nil {
			eventErr = readErr
		}

		self.debugR("read: %d total offset: %d eof: %v", bytesRead, self.Offset, eof)
		event := Event{
			Length: bytesRead,
			Offset: self.Offset,
			Bytes:  &buf,
			Err:    eventErr,
			End:    eof,
		}

		// Emit all the messages...
		handles := self.handles.List()
		for i := 0; i < len(handles); i++ {
			handle := handles[i].(*StreamHandle)
			pendingWrites := len(handle.events)
			if pendingWrites >= (MAX_PENDING_WRITE - 1) {
				handle.abort <- fmt.Errorf("Too many pending writes %d", pendingWrites)
				continue
			}
			handles[i].(*StreamHandle).events <- &event
		}

		// Return the reader errors (except for EOF) and abort.
		if !eof && readErr != nil {
			self.debugR("Read error %v", readErr)
			return readErr
		}

		// If we are done reading the stream break the loop...
		if eof {
			self.Ended = true
			self.debugR("finishing consume eof")
			break
		}
	}
	return nil
}
