package whproxy

import (
	"net"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

func (p *proxy) websocketProxy(w http.ResponseWriter, r *http.Request, session *wsmux.Session, tunnelID string) error {
	// at this point, we are sure that r is a http websocket upgrade request
	// connClosure returns the wsmux stream to Dial
	p.logf(tunnelID, r.RemoteAddr, "creating WS bridge: path=%s", r.URL.RequestURI())
	stream, id, err := session.Open()
	p.logf(tunnelID, r.RemoteAddr, "opened new stream for ws: path=%s, streamID=%d", r.URL.RequestURI(), id)

	if err != nil {
		p.logerrorf(tunnelID, r.RemoteAddr, "could not create stream: path=%s", r.URL.RequestURI())
		return err
	}
	connClosure := func(network, addr string) (net.Conn, error) {
		return stream, nil
	}
	dialer := &websocket.Dialer{
		NetDial:	connClosure,
		Subprotocols:	websocket.Subprotocols(r),
	}

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

	uri := "ws://" + r.URL.Host + r.URL.RequestURI()
	if !p.domainHosted {
		uri = "ws://" + r.URL.Host + util.ReplaceID(r.URL.RequestURI())
	}
	p.logf(tunnelID, r.RemoteAddr, "dialing ws on stream: %d, url: %s", id, uri)
	tunnelConn, _, err := dialer.Dial(uri, reqHeader)
	if err != nil {
		p.logerrorf(tunnelID, r.RemoteAddr, "could not dial tunnel: path=%s, error: %v", r.URL.RequestURI(), err)
		return err
	}
	viewerConn, err := p.upgrader.Upgrade(w, r, nil)
	if err != nil {
		p.logerrorf(tunnelID, r.RemoteAddr, "could not upgrade client connection: path=%s, error: %v", r.URL.RequestURI(), err)
		// close tunnel connection
		_ = tunnelConn.Close()
		return err
	}
	p.logf(tunnelID, r.RemoteAddr, "initiating connection bridge: %d", id)

	defer func() {
		session.RemoveStream(id)
		p.logf(tunnelID, r.RemoteAddr, "WS: closed underlying wsmux stream: path= %s, streamID=%d", r.URL.RequestURI(), id)
	}()
	// bridge both websocket connections
	return p.bridgeConn(tunnelConn, viewerConn)
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
		_ = conn2.Close()
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
