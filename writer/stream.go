package writer

import (
	"fmt"
	"io"
	"io/ioutil"
	"os"

	. "github.com/visionmedia/go-debug"
)

// Buffer size for reading the logs... This is likely even large given that we
// stream frequently but in small chunks...
const READ_BUFFER_SIZE = 8192

type Event struct {
	Err    error
	Offset int
	End    bool
}

type StreamHandle struct {
	Events chan Event
	Path   string
}

type Stream struct {
	Offset  int
	Reader  *io.Reader
	File    os.File
	Ended   bool
	Reading bool

	debug   DebugFunction
	handles []StreamHandle
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

		handles: make([]StreamHandle, 0),
		debug:   debug,
	}, nil
}

func (self *Stream) Unobserve(handle *StreamHandle) error {
	self.debug("unobserve")
	for i := 0; i < len(self.handles); i++ {
		if self.handles[i] == *handle {
			self.handles = append(self.handles[:i], self.handles[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("Attempting to remove listener twice...")
}

func (self *Stream) Observe() *StreamHandle {
	events := make(chan Event)
	handle := StreamHandle{
		Events: events,
		Path:   self.File.Name(),
	}

	self.handles = append(self.handles, handle)
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
		self.debug("removing %d handles", len(self.handles))
		for idx := range self.handles {
			self.Unobserve(&self.handles[idx])
		}
	}()

	buf := make([]byte, READ_BUFFER_SIZE)
	tee := io.TeeReader(*self.Reader, &self.File)
	for {
		bytesRead, readErr := tee.Read(buf)
		self.debug("reading bytes %d", bytesRead)

		if bytesRead > 0 {
			self.debug("read %d total offset %d", bytesRead, self.Offset)
			self.Offset += bytesRead
		}

		eof := readErr != nil && readErr == io.EOF
		event := Event{
			Err:    readErr,
			Offset: self.Offset,
			End:    eof,
		}

		// Emit all the messages...
		self.debug("notify %d event handlers", len(self.handles))
		for idx := range self.handles {
			self.handles[idx].Events <- event
		}

		// Return the reader errors (except for EOF) and abort.
		if !eof && readErr != nil {
			self.debug("Read error %v", readErr)
			return readErr
		}

		// If we are done reading the stream break the loop...
		if eof {
			self.debug("finishing consume eof")
			break
		}
	}
	return nil
}
