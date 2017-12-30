package writer

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
)

const EVENT_BUFFER_SIZE = 100

type StreamHandle struct {
	Start int64
	Stop  int64

	// Current offset in StreamHandle.
	Offset int64

	stream *Stream

	// Event notifications for WriteTo details..
	events chan *Event // Should be buffered!

	// temp buffer of events to write...
	pendingEvents []*Event
}

func newStreamHandle(stream *Stream, start, stop int64) StreamHandle {
	return StreamHandle{
		Offset: start,
		Start:  start,
		Stop:   stop,

		stream:        stream,
		events:        make(chan *Event, EVENT_BUFFER_SIZE),
		pendingEvents: make([]*Event, EVENT_BUFFER_SIZE),
	}
}

func (self *StreamHandle) writeEvent(event *Event, w io.Writer) (int64, error) {
	// Note that while we need to trim buffers here we don't need to exclude any
	// since the stream type will only dispatch events which apply to handles
	// with valid offsets...

	eventEndOffset := event.Offset + event.Length

	startOffset := self.Offset - event.Offset
	var endOffset int64
	if eventEndOffset > self.Stop {
		endOffset = eventEndOffset - self.Stop
	} else {
		endOffset = event.Length
	}

	// As bytes come in write them directly to the target.
	written, writeErr := w.Write(event.Bytes[startOffset:endOffset])

	// Should come before length equality check...
	if writeErr != nil {
		return int64(self.Offset), writeErr
	}

	return int64(written), writeErr
}

// The WriteTo method is ideal for handling the special use cases here initially
// we want to optimize for reuse of buffers across reads/writes in the future we
// can also extend this mechanism for reading from disk if events "fall behind"
func (self *StreamHandle) WriteTo(target io.Writer) (n int64, err error) {

	// Figure out if the current file sink is useful
	initialOffset := int64(self.stream.Offset)

	// Begin by fetching data from the sink first if we can.
	if initialOffset > self.Start {
		// Pipe the existing file contents over...
		file, err := os.Open(self.stream.Path)
		if err != nil {
			return 0, err
		}

		// Determine how much to copy over based on the `Stop` value for this
		// handle.
		var offset int64
		if self.Stop > initialOffset {
			offset = initialOffset
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
	if self.stream.Ended || self.Offset >= self.Stop {
		log.Printf(
			"Ending stream | ended: %v | offset: %d | stop: %s",
			self.Offset, self.Stop, self.stream.Ended,
		)
		return int64(self.Offset), nil
	}

	flusher, canFlush := target.(http.Flusher)
	if canFlush {
		flusher.Flush()
	}

	for {
		select {
		case event := <-self.events:
			pendingBuf := 0
			self.pendingEvents[0] = event

			// Build a list of all the pointers to the events we need to update. This
			// has the very important effect of emptying the channel which may be
			// building up very quickly.
			eventChannelPending := len(self.events)
			if eventChannelPending > 1 {
				log.Println("Consuming additional events", eventChannelPending)
			}
			for i := 0; i < eventChannelPending; i++ {
				self.pendingEvents[i+1] = <-self.events
				pendingBuf++
			}

			for k := 0; k <= pendingBuf; k++ {
				event := self.pendingEvents[k]
				if event == nil {
					return int64(self.Offset), fmt.Errorf("nil event.. channel likely closed due to timeout")
				}

				written, writeErr := self.writeEvent(event, target)
				self.Offset += written
				if writeErr != nil {
					return int64(self.Offset), writeErr
				}

				if event.End || self.Offset >= self.Stop {
					return int64(self.Offset), writeErr
				}
			}

			// Note how we batch flushes, flushing here is entirely optional and is
			// ultimately bad for performance but greatly improves perceived
			// performance of the logs.
			if canFlush {
				flusher.Flush()
			}
		}
	}
}
