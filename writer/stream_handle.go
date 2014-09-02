package writer

import (
	"io"
	"net/http"
)

type StreamHandle struct {
	// Source pathname.
	Path string

	// Current offset in StreamHandle.
	Offset int

	// In some situations we need to abort the request.
	abort chan error
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
		case abortErr := <-self.abort:
			return int64(self.Offset), abortErr
		}
	}
}
