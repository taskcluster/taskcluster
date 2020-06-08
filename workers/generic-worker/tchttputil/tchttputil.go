package tchttputil

import (
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
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", "localhost:"+strconv.Itoa(int(port)), 60*time.Second)
		if err != nil {
			time.Sleep(100 * time.Millisecond)
		} else {
			_ = conn.Close()
			return nil
		}
	}
	return fmt.Errorf("Timed out waiting for port %v to be active after %v", port, timeout)
}
