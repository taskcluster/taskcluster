package writer

import (
	"fmt"
	"io"
	"io/ioutil"
	"os"

	"github.com/deckarep/golang-set"
	. "github.com/visionmedia/go-debug"
)

const READ_BUFFER_SIZE = 16 * 1024 // 16kb chosen at random

type Event struct {
	Err    error
	Bytes  *[]byte
	Length int
	End    bool
	Offset int
}

type StreamHandle struct {
	Events chan *Event
	Path   string
}

type Stream struct {
	Offset  int
	Reader  *io.Reader
	File    os.File
	Ended   bool
	Reading bool

	debug   DebugFunction
	handles mapset.Set
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

	debug := Debug(fmt.Sprintf("stream [%s]", path))
	return &Stream{
		Offset:  0,
		Reader:  &read,
		Reading: false,
		Ended:   false,
		File:    *file,

		handles: mapset.NewSet(),
		debug:   debug,
	}, nil
}

func (self *Stream) Unobserve(handle *StreamHandle) {
	self.debug("unobserve")
	self.handles.Remove(handle)
}

func (self *Stream) Observe() *StreamHandle {
	events := make(chan *Event)
	handle := StreamHandle{
		Events: events,
		Path:   self.File.Name(),
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
		self.debug("removing %d handles", self.handles.Cardinality())
		self.handles.Clear()
	}()

	tee := io.TeeReader(*self.Reader, &self.File)
	for {
		buf := make([]byte, READ_BUFFER_SIZE)
		bytesRead, readErr := tee.Read(buf)
		self.debug("reading bytes %d", bytesRead)

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

		self.debug("read: %d total offset: %d eof: %v", bytesRead, self.Offset, eof)
		event := Event{
			Length: bytesRead,
			Offset: self.Offset,
			Bytes:  &buf,
			Err:    eventErr,
			End:    eof,
		}

		// Emit all the messages...
		for handle := range self.handles.Iter() {
			handle.(*StreamHandle).Events <- &event
		}

		// Return the reader errors (except for EOF) and abort.
		if !eof && readErr != nil {
			self.debug("Read error %v", readErr)
			return readErr
		}

		// If we are done reading the stream break the loop...
		if eof {
			self.Ended = true
			self.debug("finishing consume eof")
			break
		}
	}
	return nil
}
