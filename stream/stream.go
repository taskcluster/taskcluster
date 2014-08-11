package stream

import (
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
)

// XXX: These numbers are taken totally at random but in theory should limit the
// number of concurrent readers to a sane amount of memory without going crazy.
const PIPE_SIZE = 4096  // 4kib
const WRITE_SIZE = 8192 // 8kib

type WriteEvent struct {
	Offset int
	Error  error
}

type DoneEvent struct {
}

type Stream struct {
	// The underlying construct which we are reading...
	Contents *io.Reader

	// Number of bytes written so far
	Offset int

	// The file backing the writes
	File os.File

	writeEvents []chan WriteEvent
	doneEvents  []chan DoneEvent
}

func NewStream() (s *Stream, err error) {
	dir, err := ioutil.TempDir("", "continuous-log-serve")
	if err != nil {
		return nil, err
	}

	path := fmt.Sprintf(dir + "/stream")

	// Open the temp file which stores the progress of the ongoing stream this is
	// intentionally a append only file with the ability to read... The idea is
	// that we append to the file to keep track for concurrent access but we
	// should never write in the middle of the file...
	file, openErr :=
		os.OpenFile(path, os.O_APPEND|os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0666)

	if openErr != nil {
		return nil, openErr
	}

	return &Stream{
		Offset: 0,
		File:   *file,
	}, nil
}

// Remove associated files with this stream it is _not_ safe to call this until
// all reading has completed
func (stream *Stream) Close() error {
	file := stream.File.Name()
	dir := filepath.Dir(file)

	return os.RemoveAll(dir)
}

// Issue all writes in parallel but wait for them all to complete prior to
// returning...
func (stream *Stream) emitWrite(event WriteEvent) {
	writes := make(chan bool, len(stream.writeEvents))
	issueWrite := func(channel chan WriteEvent) {
		channel <- event
		writes <- true
	}

	for listener := range stream.writeEvents {
		go issueWrite(listener)
	}

	<-writes
}

func (stream *Stream) ObserveWrite(write chan WriteEvent) {
	stream.writeEvents = append(stream.writeEvents, write)
}

func (stream *Stream) UnobserveWrite(channel chan WriteEvent) error {
	for i := 0; i < len(stream.writeEvents); i++ {
		if stream.writeEvents[i] == channel {
			stream.writeEvents =
				append(stream.writeEvents[:i], stream.writeEvents[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("Cannot remove listener which was not added.")
}

// Helper to notify the channel without blocking from notifier...
func (stream *Stream) notify(channel chan int, offset int) {
	channel <- offset
}

func (stream *Stream) beginReads(reader io.Reader) {
	// Reads imply writes in this instance open the file for appending...
	log.Printf("%v", stream.File)
	buffer := make([]byte, 8192)

	for {
		bytesRead, readErr := reader.Read(buffer)

		if bytesRead > 0 {
			stream.Offset += bytesRead

			// Write to the underlying file... The bytes returned from the write are
			// not needed as they will throw an error if they don't match bytesRead
			_, writeErr := stream.File.Write(buffer[:bytesRead])

			if writeErr != nil {
				log.Fatal("Error writing fragment", writeErr)
			}

			for i := 0; i < len(stream.listeners); i++ {
				// Notify all listeners in a non-blocking fashion...
				go stream.notify(stream.listeners[i], stream.Offset)
			}
		}

		if readErr != nil {
			if readErr != io.EOF {
				// TODO: Handle errors here...
				break
			} else {
				log.Println("EOF")
				break
			}
		}
	}
}

// Writes entire contents of stream to another writer returning the first error
// or nil.
func (s *Stream) WriteAllTo(target io.Writer) error {
	file, err := os.Open(s.File.Name())
	if err != nil {
		return err
	}

	writeListener := make(chan int)
	doneListener := make(chan bool)
	s.AddListener(writeListener, doneListener)

	// Copy until we run out of bytes to copy...
	_, copyErr := io.Copy(target, file)
	if copyErr != nil {
		return copyErr
	}

	select {
	case <-doneListener:
		return nil
	case <-writeListener:
		// Copy until we run out of bytes to copy...
		_, copyErr := io.Copy(target, file)
		if copyErr != nil {
			return copyErr
		}
	}
	return nil
}

func (stream *Stream) SetContents(reader io.Reader) {
	// Useful for downstream reference via the public api but the stream handler
	// does all the real work...
	stream.Contents = &reader
	go stream.beginReads(reader)
}
