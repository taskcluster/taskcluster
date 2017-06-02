package wsmux

import (
	"bufio"
	"bytes"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sync"
	"testing"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
)

func TestGet(t *testing.T) {
	server := httptest.NewServer(genWebSocketHandler(t, wsConn))
	servURL := server.URL
	defer server.Close()
	conn, _, err := websocket.DefaultDialer.Dial(util.MakeWsURL(servURL), nil)
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, Config{Log: genLogger("get-test")})
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

func TestPost(t *testing.T) {
	server := httptest.NewServer(genWebSocketHandler(t, wsConn))
	servURL := server.URL
	defer server.Close()
	conn, _, err := (&websocket.Dialer{}).Dial(util.MakeWsURL(servURL), nil)
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, Config{Log: genLogger("post-test")})
	// session.readDeadline = time.Now().Add(10 * time.Second)
	file, err := os.Open("post-test-data")
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPost, "", file)
	stream, err := session.Open()
	if err != nil {
		t.Fatal(err)
	}
	err = req.Write(stream)
	if err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	file, err = os.Open("post-test-data")
	if err != nil {
		t.Fatal(err)
	}
	buf, err := ioutil.ReadAll(file)
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
	if !bytes.Equal(b, buf) {
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
	session := Client(conn, Config{Log: genLogger("post-test")})

	var wg sync.WaitGroup
	sendAndWait := func() {
		defer wg.Done()
		file, err := os.Open("post-test-data")
		if err != nil {
			t.Fatal(err)
		}
		req, err := http.NewRequest(http.MethodPost, "", file)
		stream, err := session.Open()
		if err != nil {
			t.Fatal(err)
		}
		err = req.Write(stream)
		if err != nil {
			t.Fatal(err)
		}
		_ = file.Close()
		file, err = os.Open("post-test-data")
		if err != nil {
			t.Fatal(err)
		}
		buf, err := ioutil.ReadAll(file)
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
		if !bytes.Equal(b, buf) {
			t.Log(bytes.NewBuffer(b).String())
			t.Fatal("message inconsistent")
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
	session := Client(conn, Config{Log: genLogger("ws-test")})
	//runtime.Breakpoint()
	// session.readDeadline = time.Now().Add(10 * time.Second)
	wsURL := &url.URL{Host: "tcproxy.net", Scheme: "ws"}
	stream, err := session.Open()
	if err != nil {
		t.Fatal(err)
	}
	//runtime.Breakpoint()
	ws, _, err := websocket.NewClient(stream, wsURL, nil, 1024, 1024)
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
