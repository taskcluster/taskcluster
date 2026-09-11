package writer

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
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

// TempDir controls where livelog creates its temporary streaming files.
// It defaults to the LIVELOG_TEMP_DIR environment variable if set, otherwise
// the system temp dir. It is overridden in tests so they can reliably clean up.
var TempDir = os.Getenv("LIVELOG_TEMP_DIR")

type Stream struct {
	Path   string
	reader *io.Reader

	// mutex covers all of the fields below
	mutex   sync.Mutex
	file    os.File
	offset  int64
	ended   bool
	handles Handles
}

func NewStream(read io.Reader) (*Stream, error) {
	dir, err := os.MkdirTemp(TempDir, "livelog")
	if err != nil {
		return nil, err
	}

	path := filepath.Join(dir, "stream")
	log.Printf("created at path %v", path)

	file, openErr :=
		os.OpenFile(path, os.O_APPEND|os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0666)

	if openErr != nil {
		os.RemoveAll(dir)
		return nil, openErr
	}

	return &Stream{
		Path:   path,
		mutex:  sync.Mutex{},
		offset: 0,
		reader: &read,
		ended:  false,
		file:   *file,

		handles: Handles{},
	}, nil
}

func (stream *Stream) Unobserve(handle *StreamHandle) {
	log.Print("unobserve")
	stream.mutex.Lock()
	defer stream.mutex.Unlock()
	delete(stream.handles, handle)
}

func (stream *Stream) Observe(start, stop int64) *StreamHandle {
	// Buffering the channel is very important to avoid writing blocks, etc..
	handle := newStreamHandle(stream, start, stop)
	stream.mutex.Lock()
	defer stream.mutex.Unlock()
	stream.handles[&handle] = emptyStruct
	return &handle
}

// Get the state of this stream in a thread-safe fashion
func (stream *Stream) GetState() (offset int64, ended bool) {
	stream.mutex.Lock()
	offset = stream.offset
	ended = stream.ended
	stream.mutex.Unlock()
	return
}

func (stream *Stream) Consume() error {
	log.Print("consume")

	defer func() {
		log.Print("consume cleanup...")

		stream.mutex.Lock()
		defer stream.mutex.Unlock()
		stream.file.Close()

		// Cleanup all handles after the consumption is complete...
		log.Printf("removing %d handles", len(stream.handles))
		for k := range stream.handles {
			delete(stream.handles, k)
		}
	}()

	tee := io.TeeReader(*stream.reader, &stream.file)
	eventNumber := 0
	stream.mutex.Lock()
	defer stream.mutex.Unlock()
	for {
		// read (which may block) without the lock held
		stream.mutex.Unlock()
		buf := make([]byte, READ_BUFFER_SIZE)
		bytesRead, readErr := tee.Read(buf)

		// remainder of the loop body holds the lock
		stream.mutex.Lock()

		startOffset := stream.offset

		if bytesRead > 0 {
			stream.offset += int64(bytesRead)
		}

		eof := readErr == io.EOF

		// EOF in this context should not be sent as an event error it is handled in
		// the .End case...
		var eventErr error
		if !eof && readErr != nil {
			eventErr = readErr
		}

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
		for handle := range stream.handles {

			// Don't write anything that starts after we end...
			if event.Offset > handle.Stop || event.Offset+event.Length <= handle.Start {
				continue
			}

			// If this handle is backed up, drop it..
			pendingWrites := len(handle.events)
			if pendingWrites >= EVENT_BUFFER_SIZE-1 {
				log.Printf("Removing handle that has failed to keep up (losing data)")
				// Remove the handle from any future event writes.  We can't use
				// Unobserve here as it locks stream.mutex, which we have already
				// locked.
				delete(stream.handles, handle)
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
			stream.ended = true
			log.Print("finishing consume eof")
			break
		}
	}
	return nil
}
