package httputil

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"time"

	"github.com/gorilla/mux"
)

type ServiceProvider interface {
	RegisterService(r *mux.Router)
}

func WaitForLocalTCPListener(port uint16, timeout time.Duration) error {
	return WaitForLocalTCPListenerWithContext(context.Background(), port, timeout)
}

// WaitForLocalTCPListenerWithContext is like WaitForLocalTCPListener but
// accepts a context for cancellation. It returns immediately if the
// context is cancelled.
func WaitForLocalTCPListenerWithContext(ctx context.Context, port uint16, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		conn, err := net.DialTimeout("tcp", "localhost:"+strconv.Itoa(int(port)), 60*time.Second)
		if err != nil {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(100 * time.Millisecond):
			}
		} else {
			_ = conn.Close()
			return nil
		}
	}
	return fmt.Errorf("timed out waiting for port %v to be active after %v", port, timeout)
}
