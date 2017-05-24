package wsmux

import (
	"bytes"
	"io"
	"testing"
	// "time"

	"github.com/gorilla/websocket"
)

func TestEcho(t *testing.T) {
	server := genServer(genWebSocketHandler(t, echoConn), ":9999")
	go func() {
		_ = server.ListenAndServe()
	}()
	defer func() {
		_ = server.Close()
	}()
	conn, _, err := (&websocket.Dialer{}).Dial("ws://127.0.0.1:9999", nil)
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, Config{Log: genLogger("echo-test")})
	// session.readDeadline = time.Now().Add(10 * time.Second)
	stream, err := session.Open()
	if err != nil {
		t.Fatal(err)
	}
	buf := []byte("Hello")
	_, err = stream.Write(buf)
	if err != nil {
		t.Fatal(err)
	}
	err = stream.Close()
	if err != nil {
		t.Fatal(err)
	}
	_, err = stream.Read(buf)
	if err != nil && err != io.EOF {
		t.Fatal(err)
	}
	if !bytes.Equal(buf, []byte("Hello")) {
		t.Fatalf("Message not consistent")
	}
}

func TestEchoLarge(t *testing.T) {
	server := genServer(genWebSocketHandler(t, echoConn), ":9999")
	go func() {
		_ = server.ListenAndServe()
	}()
	defer func() {
		_ = server.Close()
	}()
	conn, _, err := (&websocket.Dialer{}).Dial("ws://127.0.0.1:9999", nil)
	if err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 0)
	for i := 0; i < 1500; i++ {
		buf = append(buf, byte(i%127))
	}

	session := Client(conn, Config{Log: genLogger("echo-large-test")})
	// session.readDeadline = time.Now().Add(10 * time.Second)
	stream, err := session.Open()
	_, err = stream.Write(buf)
	if err != nil {
		t.Fatal(err)
	}
	err = stream.Close()
	if err != nil {
		t.Fatal(err)
	}
	final := new(bytes.Buffer)
	_, err = io.Copy(final, stream)
	if err != nil {
		t.Fatal(err)
	}

	if !bytes.Equal(buf, final.Bytes()) {
		t.Fatal("message not consistent")
	}
}
