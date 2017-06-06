package whproxy

import (
	"net"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
)

func websocketProxy(w http.ResponseWriter, r *http.Request, stream net.Conn, upgrader websocket.Upgrader) error {
	// at this point, we are sure that r is a http websocket upgrade request
	// connClosure returns the wsmux stream to Dial
	connClosure := func(network, addr string) (net.Conn, error) {
		return stream, nil
	}
	dialer := &websocket.Dialer{NetDial: connClosure}

	// create new header
	// copy request headers to new header. Avoid websocket headers
	// as these will be added by Dial
	reqHeader := make(http.Header)
	for k, v := range r.Header {
		if k == "Upgrade" ||
			k == "Connection" ||
			k == "Sec-Websocket-Key" ||
			k == "Sec-Websocket-Version" ||
			k == "Sec-Websocket-Extensions" {
			continue
		}
		reqHeader[k] = v
	}

	uri := "ws://" + r.URL.Host + util.ReplaceID(r.URL.Path)
	workerConn, _, err := dialer.Dial(uri, reqHeader)
	if err != nil {
		return err
	}
	viewerConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}

	// bridge both websocket connections
	return bridgeConn(workerConn, viewerConn)
}

func bridgeConn(conn1 *websocket.Conn, conn2 *websocket.Conn) error {
	// set ping and pong handlers
	conn1.SetPingHandler(forwardControl(websocket.PingMessage, conn2))
	conn2.SetPingHandler(forwardControl(websocket.PingMessage, conn1))

	conn1.SetPongHandler(forwardControl(websocket.PongMessage, conn2))
	conn2.SetPongHandler(forwardControl(websocket.PongMessage, conn1))

	// set close handlers
	conn1.SetCloseHandler(func(code int, text string) error {
		return conn2.Close()
	})
	conn2.SetCloseHandler(func(code int, text string) error {
		return conn1.Close()
	})

	// ensure connections are closed after bridge exits
	defer func() {
		_ = conn1.Close()
		_ = conn2.Close()
	}()

	var err1, err2 error
	done1, done2 := make(chan bool, 1), make(chan bool, 1)
	go func() {
		err1 = copyWsData(conn1, conn2)
		close(done1)
	}()
	go func() {
		err2 = copyWsData(conn2, conn1)
		close(done2)
	}()

	select {
	case <-done1:
		if err1 != nil {
			return err1
		}
	case <-done2:
		if err2 != nil {
			return err2
		}
	}

	return nil
}

func copyWsData(dest *websocket.Conn, src *websocket.Conn) error {
	for {
		mtype, buf, err := src.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure,
				websocket.CloseGoingAway) {
				return err
			}
			return nil
		}
		err = dest.WriteMessage(mtype, buf)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure,
				websocket.CloseGoingAway) {
				return err
			}
			return nil
		}
	}
}

func forwardControl(messageType int, dest *websocket.Conn) func(string) error {
	return func(appData string) error {
		return dest.WriteControl(messageType, []byte(appData), time.Now().Add(1*time.Second))
	}
}
