package expose

import (
	"io"
	"net"
)

// Forward TCP connections received on listener to the address identified by
// forwardTo.  Call this in a goroutine.  It will stop when the listener stops.
func forwardPort(forwardFrom net.Listener, forwardTo string) {
	for {
		fromConn, err := forwardFrom.Accept()
		if err != nil {
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
			_, _ = io.Copy(t, f)
		}
		go forward(fromConn, toConn)
		go forward(toConn, fromConn)
	}
}
