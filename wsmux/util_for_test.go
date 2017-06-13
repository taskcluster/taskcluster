package wsmux

import (
	"bytes"
	"io"
	"net/http"
	"os"
	"sync"
	"testing"

	log "github.com/sirupsen/logrus"

	"github.com/gorilla/websocket"
)

// logger
func genLogger(fname string) *log.Logger {
	file, err := os.Create(fname)
	if err != nil {
		panic(err)
	}
	logger := &log.Logger{
		Out:       file,
		Formatter: new(log.TextFormatter),
		Level:     log.DebugLevel,
	}
	return logger
}

func genWebSocketHandler(t *testing.T, handleConn func(*testing.T, *websocket.Conn)) http.Handler {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
	handler := func(w http.ResponseWriter, r *http.Request) {
		if !websocket.IsWebSocketUpgrade(r) {
			http.NotFound(w, r)
			t.Fatal("initial request should be ws upgrade")
			return
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatal(err)
		}
		handleConn(t, conn)
	}

	return http.HandlerFunc(handler)
}

// functions for session test

func echoConn(t *testing.T, conn *websocket.Conn) {
	session := Server(conn, Config{Log: genLogger("echo-server-test")})
	stream, err := session.Accept()
	if err != nil {
		t.Fatal(err)
	}
	buf := new(bytes.Buffer)
	_, err = io.Copy(buf, stream)
	if err != nil {
		t.Fatal(err)
	}
	_, err = io.Copy(stream, buf)
	if err != nil {
		t.Fatal(err)
	}
	err = stream.Close()
	if err != nil {
		t.Fatal(err)
	}
}

// functions for http test

const (
	getSuccess = "GET successful\n"
	wsSuccess  = "WS successful\n"
)

func wsConn(t *testing.T, conn *websocket.Conn) {
	session := Server(conn, Config{Log: genLogger("http-test")})
	mux := http.NewServeMux()
	mux.HandleFunc("/", genWsHandler(t))
	go func() {
		_ = (&http.Server{Handler: mux}).Serve(session)
	}()
}

func genWsHandler(t *testing.T) func(http.ResponseWriter, *http.Request) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
	handler := func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			if websocket.IsWebSocketUpgrade(r) {
				conn, err := upgrader.Upgrade(w, r, nil)
				if err != nil {
					t.Fatal(err)
				}
				err = conn.WriteMessage(websocket.BinaryMessage, []byte(wsSuccess))
				_, b, err := conn.ReadMessage()
				if !bytes.Equal(b, []byte(wsSuccess)) {
					t.Fatal("handler: ws over wsmux stream sent inconsistent message")
				}
			} else {
				_, _ = io.WriteString(w, getSuccess)
			}
		case http.MethodPost:
			_, _ = io.Copy(w, r.Body)
		default:
			t.Fatal("unsupported header")
		}
	}
	return handler
}

// functions for stream test

const (
	maxTestStreams = 100
)

func manyEchoConn(t *testing.T, conn *websocket.Conn) {
	session := Server(conn, Config{Log: genLogger("many-echo-server-test")})

	var wg sync.WaitGroup
	acceptor := func(i int) {
		defer wg.Done()

		str, err := session.Accept()
		if err != nil {
			t.Fatal(err)
		}

		final := make([]byte, 0)
		for {
			catch := make([]byte, 100)
			size, err := str.Read(catch)
			if err != nil && err != io.EOF {
				t.Fatal(err)
			}
			catch = catch[:size]
			final = append(final, catch...)
			if err == io.EOF {
				break
			}
		}

		_, err = str.Write(final)
		if err != nil {
			t.Fatal(err)
		}

		err = str.Close()
		if err != nil {
			t.Fatal(err)
		}
	}

	for i := 0; i < maxTestStreams; i++ {
		wg.Add(1)
		go acceptor(i)
	}

	wg.Wait()
}

func timeoutConn(t *testing.T, conn *websocket.Conn) {
	session := Server(conn, Config{StreamBufferSize: 12})
	_, err := session.Accept()
	if err != nil {
		t.Fatal(err)
	}
}
