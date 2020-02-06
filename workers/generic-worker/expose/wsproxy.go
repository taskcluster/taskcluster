package expose

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// httputil.ReverseProxy in Go1.10 doesn't support websockets, so we intercept
// that particular situation and do so manually.  This can all be removed once
// generic-worker is upgraded to Go1.12 or higher.

// What follows is based on websocktunnel's wsmux/wsmux.go
type proxy struct {
	targetPort uint16
}

var debug = false

func (p *proxy) logf(format string, v ...interface{}) {
	if debug {
		fmt.Printf(format+"\n", v...)
	}
}

func (p *proxy) websocketProxy(w http.ResponseWriter, r *http.Request) error {
	// at this point, we are sure that r is a http websocket upgrade request
	p.logf("creating WS bridge: path=%s", r.URL.RequestURI())
	dialer := &websocket.Dialer{
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

	uri := fmt.Sprintf("ws://127.0.0.1:%d", p.targetPort)
	p.logf("dialing ws at: %s", uri)
	tunnelConn, resp, err := dialer.Dial(uri, reqHeader)
	if err != nil {
		p.logf("could not dial tunnel: path=%s, error: %v", r.URL.RequestURI(), err)
		return err
	}
	defer resp.Body.Close()

	upgrader := websocket.Upgrader{
		Subprotocols: websocket.Subprotocols(r),
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
	viewerConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		p.logf("could not upgrade client connection: path=%s, error: %v", r.URL.RequestURI(), err)
		// close tunnel connection
		_ = tunnelConn.Close()
		return err
	}
	p.logf("initiating connection bridge")

	// bridge both websocket connections
	bridgeErr := p.bridgeConn(tunnelConn, viewerConn)
	if bridgeErr != nil {
		p.logf("bridge closed with err: %v", bridgeErr)
	}

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

// the main entry point: generate an http.HandlerFunc that will mostly just use
// the given ReverseProxy, but will handle websockets, too.
func websockCompatibleHandlerFunc(reverseproxy *httputil.ReverseProxy, targetPort uint16) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if websocket.IsWebSocketUpgrade(r) {
			p := proxy{targetPort: targetPort}
			_ = p.websocketProxy(w, r)
		}

		// not a websocket thing; defer to ReverseProxy
		reverseproxy.ServeHTTP(w, r)
		return
	}
}
