package writer

import (
	"fmt"
	"io"
	"net/http"
	"time"
)

const INACTIVITY_TIMEOUT = 30 * time.Second

type StreamHandle struct {
	// Source pathname.
	Path string

	// Current offset in StreamHandle.
	Offset int

	// Event notifications for WriteTo details..
	events chan *Event // Should be buffered!
}

// The WriteTo method is ideal for handling the special use cases here initially
// we want to optimize for reuse of buffers across reads/writes in the future we
// can also extend this mechanism for reading from disk if events "fall behind"
func (self *StreamHandle) WriteTo(target io.Writer) (n int64, err error) {
	// Remember this interface is designed to drain the entire reader so we must
	// be careful to send errors if something goes wrong as soon as possible...

	// TODO: Add more options to configure flushing...
	flusher, canFlush := target.(http.Flusher)
	for {
		select {
		case event := <-self.events:

			// Handle aborts caused by closing run away channels...
			if event == nil {
				return int64(self.Offset), fmt.Errorf("nil event.. channel likely closed due to timeout")
			}

			// As bytes come in write them directly to the target.
			written, writeErr := target.Write((*event.Bytes)[0:event.Length])
			self.Offset += written

			// TODO: Flushing here may cause problems... Ideally we would only flush
			// in logical batches when our writes are backed up...
			if canFlush {
				flusher.Flush()
			}

			// Should come before length equality check...
			if writeErr != nil {
				return int64(self.Offset), writeErr
			}

			if written != event.Length {
				panic("Write error written != event.Length")
			}

			if event.End {
				return int64(self.Offset), writeErr
			}
		case <-time.After(INACTIVITY_TIMEOUT):
			return int64(self.Offset), fmt.Errorf("Timeout after %v", INACTIVITY_TIMEOUT)
		}
	}
}
