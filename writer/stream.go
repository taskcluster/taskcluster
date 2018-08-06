package writer

import (
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
)

const READ_BUFFER_SIZE = 4 * 1024 // XXX: 4kb chosen at random

type Event struct {
	Number int
	Err    error
	Bytes  []byte
	Length int64
	End    bool
	Offset int64
}

// Handles represents a set of *StreamHandles
type Handles map[*StreamHandle]struct{}

// emptyStruct cannot be declared as a constant, so var is next best option
var emptyStruct = struct{}{}

type Stream struct {
	Path    string
	Offset  int64
	Reader  *io.Reader
	File    os.File
	Ended   bool
	Reading bool

	handles Handles
}

func NewStream(read io.Reader) (*Stream, error) {
	dir, err := ioutil.TempDir("", "livelog")
	if err != nil {
		return nil, err
	}

	path := fmt.Sprintf(dir + "/stream")
	log.Printf("created at path %v", path)

	file, openErr :=
		os.OpenFile(path, os.O_APPEND|os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0666)

	if openErr != nil {
		return nil, openErr
	}

	return &Stream{
		Path:    path,
		Offset:  0,
		Reader:  &read,
		Reading: false,
		Ended:   false,
		File:    *file,

		handles: Handles{},
	}, nil
}

func (self *Stream) Unobserve(handle *StreamHandle) {
	log.Print("unobserve")
	delete(self.handles, handle)
}

func (self *Stream) Observe(start, stop int64) *StreamHandle {
	// Buffering the channel is very important to avoid writing blocks, etc..
	handle := newStreamHandle(self, start, stop)
	self.handles[&handle] = emptyStruct
	return &handle
}

func (self *Stream) Consume() error {
	log.Print("consume")
	if self.Reading {
		return fmt.Errorf("Cannot consome twice...")
	}

	defer func() {
		log.Print("consume cleanup...")

		self.File.Close()

		// Cleanup all handles after the consumption is complete...
		log.Printf("removing %d handles", len(self.handles))
		for k := range self.handles {
			delete(self.handles, k)
		}
	}()

	tee := io.TeeReader(*self.Reader, &self.File)
	eventNumber := 0
	for {
		buf := make([]byte, READ_BUFFER_SIZE)
		bytesRead, readErr := tee.Read(buf)
		log.Printf("reading bytes %d", bytesRead)

		startOffset := self.Offset

		if bytesRead > 0 {
			self.Offset += int64(bytesRead)
		}

		eof := readErr == io.EOF

		// EOF in this context should not be sent as an event error it is handled in
		// the .End case...
		var eventErr error
		if !eof && readErr != nil {
			eventErr = readErr
		}

		log.Printf("read: %d total offset: %d eof: %v", bytesRead, self.Offset, eof)
		event := Event{
			Number: eventNumber,
			Length: int64(bytesRead),
			Offset: startOffset,
			Bytes:  buf,
			Err:    eventErr,
			End:    eof,
		}
		eventNumber++

		// Emit all the messages...
		for handle := range self.handles {

			// Don't write anything that starts after we end...
			if event.Offset > handle.Stop || event.Offset+event.Length <= handle.Start {
				continue
			}

			pendingWrites := len(handle.events)
			if pendingWrites >= EVENT_BUFFER_SIZE-1 {
				log.Printf("Removing handle with %d pending writes\n", pendingWrites)
				// Remove the handle from any future event writes...
				self.Unobserve(handle)
				close(handle.events)
				continue
			}
			handle.events <- &event
		}

		// Return the reader errors (except for EOF) and abort.
		if !eof && readErr != nil {
			log.Printf("Read error %v", readErr)
			return readErr
		}

		// If we are done reading the stream break the loop...
		if eof {
			self.Ended = true
			log.Print("finishing consume eof")
			break
		}
	}
	return nil
}
