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
	// Current offset in StreamHandle.
	Offset int

	stream *Stream

	// Event notifications for WriteTo details..
	events chan *Event // Should be buffered!

	// temp buffer of events to write...
	pendingEvents []*Event
}

func newStreamHandle(stream *Stream) StreamHandle {
	return StreamHandle{
		Offset: 0,

		stream:        stream,
		events:        make(chan *Event, EVENT_BUFFER_SIZE),
		pendingEvents: make([]*Event, EVENT_BUFFER_SIZE),
	}
}

func (self *StreamHandle) writeEvent(event *Event, w io.Writer) (int64, error) {
	// As bytes come in write them directly to the target.
	written, writeErr := w.Write(event.Bytes[0:event.Length])

	// Should come before length equality check...
	if writeErr != nil {
		return int64(self.Offset), writeErr
	}

	if written != event.Length {
		panic("Write error written != event.Length")
	}

	return int64(written), writeErr
}

// The WriteTo method is ideal for handling the special use cases here initially
// we want to optimize for reuse of buffers across reads/writes in the future we
// can also extend this mechanism for reading from disk if events "fall behind"
func (self *StreamHandle) WriteTo(target io.Writer) (n int64, err error) {
	// Remember this interface is designed to drain the entire reader so we must
	// be careful to send errors if something goes wrong as soon as possible...

	// Pipe the existing file contents over...
	file, err := os.Open(self.stream.Path)
	if err != nil {
		return 0, err
	}

	initialOffset := self.stream.Offset
	// Begin by copying the initial data from the sink...
	written, copyErr := io.CopyN(target, file, int64(initialOffset))
	self.Offset += int(written)

	if copyErr != nil {
		return int64(self.Offset), copyErr
	}

	if self.stream.Ended {
		// Handle the edge case where the file has ended while we where coping bytes
		// over above.
		if initialOffset != self.stream.Offset {
			// copy drains entire file until EOF
			finalWrite, _ := io.Copy(target, file)
			self.Offset += int(finalWrite)
		}
		file.Close()
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
				self.Offset += int(written)
				if writeErr != nil {
					return int64(self.Offset), writeErr
				}

				if event.End {
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
