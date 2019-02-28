package expose

import (
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var keepAliveInterval time.Duration

// Accept websocket connections at path / and forward them to the local port.
func websocketToTCPHandlerFunc(targetPort uint16) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}

		if !websocket.IsWebSocketUpgrade(r) {
			http.NotFound(w, r)
			return
		}

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

		// only one thing is allowed to write to the wsconn at a time
		var writeLock sync.Mutex

		tcpconn, err := net.Dial("tcp", fmt.Sprintf("127.0.0.1:%d", targetPort))
		if err != nil {
			http.Error(w, fmt.Sprintf("Could not connect to TCP port: %s", err), 502)
			return
		}
		defer tcpconn.Close()

		// when it's time to tear down the connection, tear down both sides
		kill := func() {
			tcpconn.Close()
			wsconn.Close()
		}

		// Handle control messages
		wsconn.SetPingHandler(func(appData string) error {
			writeLock.Lock()
			defer writeLock.Unlock()
			return wsconn.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(5*time.Second))
		})

		// send keepalives every 10s
		ticker := time.NewTicker(10 * time.Second)
		go func() {
			for {
				<-ticker.C

				writeLock.Lock()
				err := wsconn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second))
				writeLock.Unlock()
				if err != nil {
					kill()
					return
				}
			}
		}()
		defer ticker.Stop()

		wsconn.SetCloseHandler(func(code int, text string) error {
			kill()
			return nil
		})

		// bridge the two connections together, breaking the connection entirely
		// when any piece fails and completing this function when both directions
		// are closed
		var wg sync.WaitGroup
		wg.Add(2)

		go func() {
			defer kill()
			for {
				messageType, payload, err := wsconn.ReadMessage()
				if err != nil {
					// typically this means the connection was closed, but
					// regardless of the error we want to close the TCP connection.
					return
				}
				if messageType != websocket.BinaryMessage {
					// this is a protocol error; we don't support Text
					return
				}

				_, err = tcpconn.Write(payload)
				if err != nil {
					// An error occurred before the full payload could
					// be written; close the connection
					return
				}
			}
		}()

		go func() {
			defer kill()
			var buf []byte = make([]byte, 1024*512)
			for {
				n, err := tcpconn.Read(buf)
				if err != nil {
					return
				}
				var data = buf[:n]

				writeLock.Lock()
				err = wsconn.WriteMessage(websocket.BinaryMessage, data)
				writeLock.Unlock()
				if err != nil {
					return
				}
			}
		}()

		wg.Wait()

		return
	}
}
