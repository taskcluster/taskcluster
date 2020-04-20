package writer

import (
	"io"
	"log"
	"net/http"
	"os"
)

const EVENT_BUFFER_SIZE = 200

type StreamHandle struct {
	Start int64
	Stop  int64

	// Current offset in StreamHandle.
	Offset int64

	stream *Stream

	// Event notifications for WriteTo details..
	events chan *Event // Should be buffered!
}

func newStreamHandle(stream *Stream, start, stop int64) StreamHandle {
	return StreamHandle{
		Offset: start,
		Start:  start,
		Stop:   stop,

		stream: stream,
		events: make(chan *Event, EVENT_BUFFER_SIZE),
	}
}

func (self *StreamHandle) writeEvent(event *Event, w io.Writer) (int64, error) {
	// We may receive events that were generated while we were catching up
	// in the backing log, so we may need to ignore some or all of the bytes
	// in this event..

	eventEndOffset := event.Offset + event.Length
	if self.Offset >= eventEndOffset {
		return 0, nil
	}

	// calculate the slice of the event's bytes that we need..
	startInEvent := self.Offset - event.Offset
	var endInEvent int64
	if eventEndOffset > self.Stop {
		endInEvent = eventEndOffset - self.Stop
	} else {
		endInEvent = event.Length
	}

	// As bytes come in write them directly to the target.
	written, writeErr := w.Write(event.Bytes[startInEvent:endInEvent])

	// Should come before length equality check...
	if writeErr != nil {
		return int64(0), writeErr
	}

	return int64(written), writeErr
}

// The WriteTo method is ideal for handling the special use cases here initially
// we want to optimize for reuse of buffers across reads/writes in the future we
// can also extend this mechanism for reading from disk if events "fall behind"
func (self *StreamHandle) WriteTo(target io.Writer) (n int64, err error) {
	streamOffset, streamEnded := self.stream.GetState()

	// Begin by fetching data from the sink first if we can.
	if streamOffset > self.Start {
		// Pipe the existing file contents over...
		file, err := os.Open(self.stream.Path)
		if err != nil {
			return 0, err
		}

		// Determine how much to copy over based on the `Stop` value for this
		// handle.
		var offset int64
		if self.Stop > streamOffset {
			offset = streamOffset
		} else {
			offset = self.Stop
		}

		// Begin by copying the initial data from the sink...
		written, copyErr := io.CopyN(target, file, offset)
		file.Close()

		self.Offset += written
		if copyErr != nil {
			return int64(self.Offset), copyErr
		}
	}

	// If the stream is over or we drained enough of it then stop before event
	// processing begins...
	if streamEnded || self.Offset >= self.Stop {
		log.Printf(
			"Ending stream | ended: %v | offset: %d | stop: %v",
			self.Offset, self.Stop, streamEnded,
		)
		return int64(self.Offset), nil
	}

	flusher, canFlush := target.(http.Flusher)
	if canFlush {
		flusher.Flush()
	}

	for event := range self.events {
		written, writeErr := self.writeEvent(event, target)
		self.Offset += written
		if writeErr != nil {
			return int64(self.Offset), writeErr
		}

		if event.End || self.Offset >= self.Stop {
			return int64(self.Offset), writeErr
		}

		// Note how we batch flushes, flushing here is entirely optional and is
		// ultimately bad for performance but greatly improves perceived
		// performance of the logs.
		if canFlush && len(self.events) == 0 {
			flusher.Flush()
		}
	}
	return int64(self.Offset), io.EOF
}
