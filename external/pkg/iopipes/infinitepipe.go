package iopipes

import (
	"io"
	"sync"
)

// InfinitePipeReader is a reading side of an InfinitePipe, similar to io.PipeReader.
type InfinitePipeReader struct {
	*InfinitePipeWriter
}

// InfinitePipeWriter is a writing side of an InfinitePipe, similar to io.PipeWriter.
type InfinitePipeWriter struct {
	c      sync.Cond
	m      sync.Mutex
	buffer []byte
	closed bool
	broken bool
	tell   chan<- bool
}

// InfinitePipe is similar to io.Pipe() except that writes will always
// succeed. Data will be added to an internal buffer that will always grow.
// Additionally, you may supply a channel tell that will be told whenever
// the Infinite channel has been emptied, so that more bytes can be requested
// to be written.
//
// This pipe kind is useful when implementing simple congestion control.
func InfinitePipe(tell chan<- bool) (*InfinitePipeReader, *InfinitePipeWriter) {
	w := &InfinitePipeWriter{
		tell: tell,
	}
	w.c.L = &w.m
	return &InfinitePipeReader{w}, w
}

func (r *InfinitePipeReader) Read(p []byte) (int, error) {
	r.m.Lock()
	defer r.m.Unlock()

	for len(r.buffer) == 0 && !r.closed {
		r.c.Wait()
	}

	// Copy to return value
	n := copy(p, r.buffer)

	// Move the rest of the buffer
	m := copy(r.buffer, r.buffer[n:])
	r.buffer = r.buffer[:m]

	// Set error to EOF, if closed and we're at the end of the buffer
	var err error
	if r.closed && len(r.buffer) == 0 {
		err = io.EOF
		if r.tell != nil {
			close(r.tell)
			r.tell = nil
		}
	}

	return n, err
}

// Close the pipe reader
func (r *InfinitePipeReader) Close() error {
	r.m.Lock()
	defer r.m.Unlock()
	r.closed = true
	r.broken = true
	r.c.Broadcast()
	return nil
}

func (w *InfinitePipeWriter) Write(p []byte) (int, error) {
	w.m.Lock()
	defer w.m.Unlock()

	// If pipe is closed we'll return an error
	if w.closed {
		return 0, io.ErrClosedPipe
	}

	// Remember if it was empty, so we know if we should signal
	empty := len(w.buffer) == 0

	// Append data
	w.buffer = append(w.buffer, p...)

	// Signal threads waiting, if we just added data
	if empty && len(p) > 0 {
		w.c.Broadcast()
	}

	return len(p), nil
}

// Close will close the stream
func (w *InfinitePipeWriter) Close() error {
	w.m.Lock()
	defer w.m.Unlock()

	if w.closed && w.broken {
		return io.ErrClosedPipe
	}

	w.closed = true
	w.c.Broadcast()
	return nil
}
