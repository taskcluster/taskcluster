package expose

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gorilla/websocket"
)

func listenOnRandomPort() (net.Listener, uint16, error) {
	// allocate a port dynamically by specifying :0
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return nil, 0, err
	}

	// retrive the selected port from the listener
	_, portStr, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		return nil, 0, err
	}

	port, err := strconv.Atoi(portStr)
	if err != nil {
		return nil, 0, err
	}

	return listener, uint16(port), nil
}

// Listen for a single connection on the given listener,
// echo the entire contents of that connection, and then
// send true to the channel after the connection closes.
func tcpEchoServer(listener net.Listener) chan bool {
	connClosed := make(chan bool, 0)
	go func() {
		stream, err := listener.Accept()
		if err != nil {
			return
		}

		io.Copy(stream, stream)
		_ = stream.Close()
		connClosed <- true
	}()
	return connClosed
}

// Create an httptest-based server that upgrades its connections to websockets
// and for each connection reads a message, echoes it back, and closes
func websockEchoServer(t *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			Subprotocols: websocket.Subprotocols(r),
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		}

		wsconn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			http.Error(w, fmt.Sprintf("Could not upgrade: %s", err), 500)
			return
		}
		defer wsconn.Close()

		messageType, payload, err := wsconn.ReadMessage()
		if err != nil {
			t.Logf("server ReadMessage: %s", err)
			return
		}

		err = wsconn.WriteMessage(messageType, payload)
		if err != nil {
			t.Logf("server WriteMessage: %s", err)
			return
		}
	}))
}
