package wsproxy

import (
	"io"
	"net"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/websocktunnel/wsmux"
)

func (p *proxy) websocketProxy(w http.ResponseWriter, r *http.Request, session *wsmux.Session, tunnelID string, path string) error {
	// at this point, we are sure that r is a http websocket upgrade request
	// connClosure returns the wsmux stream to Dial
	p.logf(tunnelID, r.RemoteAddr, "creating WS bridge: path=%s", r.URL.RequestURI())
	stream, err := session.Open()
	p.logf(tunnelID, r.RemoteAddr, "opened new stream for ws: path=%s", r.URL.RequestURI())

	if err != nil {
		p.logerrorf(tunnelID, r.RemoteAddr, "could not create stream: path=%s", r.URL.RequestURI())
		return err
	}
	connClosure := func(network, addr string) (net.Conn, error) {
		return stream, nil
	}
	dialer := &websocket.Dialer{
		NetDial:      connClosure,
		Subprotocols: websocket.Subprotocols(r),
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
			k == "Sec-Websocket-Extensions" ||
			k == "Sec-Websocket-Protocol" {
			continue
		}
		reqHeader[k] = v
	}

	uri := "ws://" + r.Host + path
	p.logf(tunnelID, r.RemoteAddr, "dialing ws on stream, url: %s", uri)
	tunnelConn, _, err := dialer.Dial(uri, reqHeader)
	if err != nil {
		p.logerrorf(tunnelID, r.RemoteAddr, "could not dial tunnel: path=%s, error: %v", r.URL.RequestURI(), err)
		return err
	}

	upgrader := websocket.Upgrader{
		Subprotocols: websocket.Subprotocols(r),
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
	viewerConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		p.logerrorf(tunnelID, r.RemoteAddr, "could not upgrade client connection: path=%s, error: %v", r.URL.RequestURI(), err)
		// close tunnel connection
		_ = tunnelConn.Close()
		return err
	}
	p.logf(tunnelID, r.RemoteAddr, "initiating connection bridge")

	// bridge both websocket connections
	bridgeErr := p.bridgeConn(tunnelConn, viewerConn)
	if bridgeErr != nil {
		p.logerrorf(tunnelID, r.RemoteAddr, "bridge closed with err: %v", bridgeErr)
	}

	// close the stream even if there was a bridge error
	err = stream.Close()

	if bridgeErr != nil {
		return bridgeErr
	}
	return err
}

func (p *proxy) bridgeConn(conn1 *websocket.Conn, conn2 *websocket.Conn) error {
	// set ping and pong handlers
	conn1.SetPingHandler(forwardControl(websocket.PingMessage, conn2))
	conn2.SetPingHandler(forwardControl(websocket.PingMessage, conn1))

	conn1.SetPongHandler(forwardControl(websocket.PongMessage, conn2))
	conn2.SetPongHandler(forwardControl(websocket.PongMessage, conn1))

	// set close handlers
	conn1.SetCloseHandler(func(code int, text string) error {
		return nil
	})
	conn2.SetCloseHandler(func(code int, text string) error {
		return nil
	})

	// ensure connections are closed after bridge exits
	defer func() {
		_ = conn1.Close()
		_ = conn2.Close()
	}()

	kill := make(chan bool, 1)
	var eSrc, eDest atomic.Value
	// Wait until errors are written

	go func() {
		err := copyWsData(conn1, conn2, kill)
		if err != nil {
			eSrc.Store(err)
		}
	}()
	go func() {
		err := copyWsData(conn2, conn1, kill)
		if err != nil {
			eDest.Store(err)
		}
	}()

	<-kill
	if err, ok := eSrc.Load().(error); ok && err != nil {
		return err
	}
	if err, ok := eDest.Load().(error); ok && err != nil {
		return err
	}
	return nil
}

func copyWsData(dest *websocket.Conn, src *websocket.Conn, kill chan bool) error {
	defer asyncClose(kill)
	for {
		mtype, reader, err := src.NextReader()
		if err != nil {
			// Abnormal closure occurs if the websocket is over a wsmux stream
			if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure,
				websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				return err
			}
			return nil
		}
		writer, err := dest.NextWriter(mtype)
		if err != nil {
			// Abnormal closure occurs if the websocket is over a wsmux stream
			if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure,
				websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				return err
			}
			return nil
		}
		_, err = io.Copy(writer, reader)
		_ = writer.Close()
		if err != nil {
			return err
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
		return dest.WriteControl(messageType, []byte(appData), time.Now().Add(20*time.Second))
	}
}

func asyncClose(kill chan bool) {
	select {
	case <-kill:
	default:
		close(kill)
	}
}
