package wsmux

import (
	"bufio"
	"bytes"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/taskcluster/v46/tools/websocktunnel/util"
)

type wrapStream struct {
	*bytes.Buffer
}

func TestGet(t *testing.T) {
	server := httptest.NewServer(genWebSocketHandler(t, wsConn))
	servURL := server.URL
	defer server.Close()
	conn, _, err := websocket.DefaultDialer.Dial(util.MakeWsURL(servURL), nil)
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, Config{Log: genLogger()})
	// session.readDeadline = time.Now().Add(10 * time.Second)
	req, err := http.NewRequest(http.MethodGet, "", nil)
	if err != nil {
		t.Fatal(err)
	}
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
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(b, []byte(getSuccess)) {
		t.Log(bytes.NewBuffer(b).String())
		t.Fatal("message inconsistent")
	}
}

func TestPost(t *testing.T) {
	server := httptest.NewServer(genWebSocketHandler(t, wsConn))
	servURL := server.URL
	defer server.Close()
	conn, _, err := (&websocket.Dialer{}).Dial(util.MakeWsURL(servURL), nil)
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, Config{Log: genLogger()})
	// session.readDeadline = time.Now().Add(10 * time.Second)
	msg := []byte("message to be sent in a post request")
	buffer := new(bytes.Buffer)
	_, _ = buffer.Write(msg)
	req, err := http.NewRequest(http.MethodPost, "", wrapStream{buffer})
	if err != nil {
		t.Fatal(err)
	}
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
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(b, msg) {
		t.Log(bytes.NewBuffer(b).String())
		t.Fatal("message inconsistent")
	}
}

func TestMultiplePost(t *testing.T) {
	server := httptest.NewServer(genWebSocketHandler(t, wsConn))
	servURL := server.URL
	defer server.Close()
	conn, _, err := (&websocket.Dialer{}).Dial(util.MakeWsURL(servURL), nil)
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, Config{Log: genLogger()})

	var wg sync.WaitGroup
	sendAndWait := func() {
		msg := []byte("message to be sent in a post request")
		buffer := new(bytes.Buffer)
		_, _ = buffer.Write(msg)
		defer wg.Done()

		req, err := http.NewRequest(http.MethodPost, "", wrapStream{buffer})
		if err != nil {
			panic(err)
		}
		stream, err := session.Open()
		if err != nil {
			panic(err)
		}
		err = req.Write(stream)
		if err != nil {
			panic(err)
		}

		reader := bufio.NewReader(stream)
		resp, err := http.ReadResponse(reader, nil)
		if err != nil {
			panic(err)
		}
		b, err := io.ReadAll(resp.Body)
		if err != nil {
			panic(err)
		}
		if !bytes.Equal(b, msg) {
			t.Log(bytes.NewBuffer(b).String())
			panic("message inconsistent")
		}
	}

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go sendAndWait()
	}
	wg.Wait()
}

func TestWebSocket(t *testing.T) {
	// t.Skip("No idea why this is failing")
	server := httptest.NewServer(genWebSocketHandler(t, wsConn))
	servURL := server.URL
	defer server.Close()
	conn, _, err := (&websocket.Dialer{}).Dial(util.MakeWsURL(servURL), nil)
	//runtime.Breakpoint()
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, Config{Log: genLogger()})
	dialer := websocket.Dialer{
		NetDial: func(network, addr string) (net.Conn, error) {
			return session.Open()
		},
	}
	ws, _, err := dialer.Dial("ws://tcproxy.net", nil)
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
