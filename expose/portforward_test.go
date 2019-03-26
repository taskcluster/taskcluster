package expose

import (
	"fmt"
	"net"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPortForward(t *testing.T) {
	listener1, listen1Port, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}
	defer listener1.Close()

	listener2, listen2Port, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}
	defer listener2.Close()

	t.Logf("forwarding %d -> %d", listen1Port, listen2Port)
	go forwardPort(listener1, fmt.Sprintf("127.0.0.1:%d", listen2Port))

	// run a tcp echo server on listener2, that will send to
	// connClosed once the connection is closed
	t.Logf("echo server on %d", listen2Port)
	connClosed := tcpEchoServer(listener2)

	// try to connect to listen1port
	t.Logf("test dialling %d", listen1Port)
	conn, err := net.Dial("tcp", fmt.Sprintf("127.0.0.1:%d", listen1Port))
	if err != nil {
		t.Fatalf("net.Dial: %s", err)
	}

	conn.Write([]byte("Hello!"))

	got := make([]byte, 20)
	n, err := conn.Read(got)
	if err != nil {
		t.Fatalf("Read: %s", err)
	}
	assert.Equal(t, []byte("Hello!"), got[:n], "got expected echo")
	conn.Close()

	<-connClosed
}
