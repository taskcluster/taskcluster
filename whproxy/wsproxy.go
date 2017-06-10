package whproxy

import (
	"net"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

func (p *proxy) websocketProxy(w http.ResponseWriter, r *http.Request, session *wsmux.Session) error {
	// at this point, we are sure that r is a http websocket upgrade request
	// connClosure returns the wsmux stream to Dial
	stream, id, err := session.Open()
	if err != nil {
		return err
	}
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
	viewerConn, err := p.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}

	defer session.RemoveStream(id)
	// bridge both websocket connections
	return p.bridgeConn(workerConn, viewerConn)
}

func (p *proxy) bridgeConn(conn1 *websocket.Conn, conn2 *websocket.Conn) error {
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
		p.logger.Printf("PROXY: WS: closed source connection")
		_ = conn2.Close()
		p.logger.Printf("PROXT: WS: closed dest connection")
	}()

	kill := make(chan bool, 1)
	go func() {
		_ = copyWsData(conn1, conn2, kill)
		select {
		case <-kill:
		default:
			close(kill)
		}
	}()
	go func() {
		_ = copyWsData(conn2, conn1, kill)
		select {
		case <-kill:
		default:
			close(kill)
		}
	}()

	<-kill
	return nil
}

func copyWsData(dest *websocket.Conn, src *websocket.Conn, kill chan bool) error {
	for {
		mtype, buf, err := src.ReadMessage()
		if err != nil {
			// Abnormal closure occurs if the websocket is over a wsmux stream
			if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure,
				websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				return err
			}
			return nil
		}
		err = dest.WriteMessage(mtype, buf)
		if err != nil {
			// Abnormal closure occurs if the websocket is over a wsmux stream
			if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure,
				websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				return err
			}
			return nil
		}
		select {
		case <-kill:
			return nil
		default:
		}
	}
}

func forwardControl(messageType int, dest *websocket.Conn) func(string) error {
	return func(appData string) error {
		return dest.WriteControl(messageType, []byte(appData), time.Now().Add(1*time.Second))
	}
}
