package expose

import (
	"io"
	"net"
	"time"
)

// Forward TCP connections received on listener to the address identified by
// forwardTo.  Call this in a goroutine.  It will stop when the listener stops.
func forwardPort(forwardFrom net.Listener, forwardTo string) {
	waitTime := 5 * time.Millisecond // default wait time when connection fails
	for {
		fromConn, err := forwardFrom.Accept()
		if err != nil {
			// wait and try again if it's a temporary error
			if ne, ok := err.(net.Error); ok && ne.Temporary() {
				time.Sleep(waitTime)
				waitTime = 2 * waitTime
				continue
			}
			// for non-temporary or unrecognized errors, just return (this
			// typically means the listener has shut down)
			return
		}

		toConn, err := net.Dial("tcp", forwardTo)
		if err != nil {
			// simulate a connection refused to the fromConn, although this will
			// appear as an immediate close, rather than a refusal
			fromConn.Close()
			continue
		}

		forward := func(f net.Conn, t net.Conn) {
			defer t.Close()
			io.Copy(t, f)
		}
		go forward(fromConn, toConn)
		go forward(toConn, fromConn)
	}
}
