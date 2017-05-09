package wsmux

import (
	"bufio"
	"bytes"
	"io/ioutil"
	"net/http"
	"net/url"
	// "runtime"
	"testing"
	// "time"

	"github.com/gorilla/websocket"
)

func TestGet(t *testing.T) {
	server := genServer(genWebSocketHandler(t, wsConn), ":9999")
	go server.ListenAndServe()
	defer server.Close()
	conn, _, err := (&websocket.Dialer{}).Dial("ws://127.0.0.1:9999", nil)
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, &Config{Log: genLogger("get-test")})
	// session.readDeadline = time.Now().Add(10 * time.Second)
	req, err := http.NewRequest(http.MethodGet, "", nil)
	stream, err := session.Open()
	if err != nil {
		t.Fatal(err)
	}
	err = req.Write(stream)
	if err != nil {
		t.Fatal(err)
	}
	reader := bufio.NewReader(stream)
	resp, err := http.ReadResponse(reader, nil)
	if err != nil {
		t.Fatal(err)
	}
	b, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(b, []byte(getSuccess)) {
		t.Log(bytes.NewBuffer(b).String())
		t.Fatal("message inconsistent")
	}
}

func TestWebSocket(t *testing.T) {
	// t.Skip("No idea why this is failing")
	server := genServer(genWebSocketHandler(t, wsConn), ":9999")
	go server.ListenAndServe()
	defer server.Close()
	conn, _, err := (&websocket.Dialer{}).Dial("ws://127.0.0.1:9999", nil)
	//runtime.Breakpoint()
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, &Config{Log: genLogger("ws-test")})
	//runtime.Breakpoint()
	// session.readDeadline = time.Now().Add(10 * time.Second)
	url := &url.URL{Host: "tcproxy.net", Scheme: "ws"}
	stream, err := session.Open()
	if err != nil {
		t.Fatal(err)
	}
	//runtime.Breakpoint()
	ws, _, err := websocket.NewClient(stream, url, nil, 1024, 1024)
	if err != nil {
		t.Fatal(err)
	}
	_, b, err := ws.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(b, []byte(wsSuccess)) {
		t.Log(bytes.NewBuffer(b).String())
		t.Fatal("message inconsistent")
	}

}
