package wsmux

import (
	"bufio"
	"bytes"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"testing"

	"github.com/gorilla/websocket"
)

const (
	getSuccess = "GET successful\n"
)

func handler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		io.WriteString(w, getSuccess)
	default:
		http.NotFound(w, r)
	}
}

func wrapSession(session *Session) {
	server := &http.Server{Handler: http.HandlerFunc(handler)}
	go server.Serve(session)
}
func init() {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	http.HandleFunc("/http", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			panic(err)
		}
		wrapSession(Server(conn, nil))
	})

	go func() {
		log.Fatal(http.ListenAndServe(":9998", nil))
	}()
}

func TestGet(t *testing.T) {
	conn, _, err := (&websocket.Dialer{}).Dial("ws://127.0.0.1:9998/http", nil)
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, nil)
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
