package wsproxy

import (
	"io"
	"net/http"
	"sync"
	"time"
)

// stream utils
type threadSafeWriteFlusher struct {
	m sync.Mutex
	w io.Writer
	f http.Flusher
}

func (w *threadSafeWriteFlusher) Write(p []byte) (int, error) {
	w.m.Lock()
	defer w.m.Unlock()
	return w.w.Write(p)
}

func (w *threadSafeWriteFlusher) Flush() {
	w.m.Lock()
	defer w.m.Unlock()
	w.f.Flush()
}

// copyAndFlush periodically flushes data to the writeFlusher
func copyAndFlush(w *threadSafeWriteFlusher, r io.Reader, interval time.Duration) (int64, error) {
	// close this channel when copying is complete
	done := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	// start routine which flushes at regular intervals
	go func() {
		for {
			select {
			case <-time.After(interval):
				w.Flush()
			case <-done:
				wg.Done()
				// copy has completed
				return
			}
		}
	}()

	n, err := io.Copy(w, r)
	close(done)
	wg.Wait()

	// final flush before returning
	w.Flush()

	return n, err
}
