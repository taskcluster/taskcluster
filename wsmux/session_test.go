package wsmux

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"os"
	"testing"

	"github.com/gorilla/websocket"
)

var testLogger *log.Logger

func init() {
	file, err := os.Create("test_log")
	if err != nil {
		panic(err)
	}
	testLogger = log.New(file, "test: ", log.Lshortfile)
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			testLogger.Fatal(err)
		}
		session := Server(conn, nil)
		stream, err := session.Accept()
		if err != nil {
			testLogger.Fatal(err)
		}
		handleStream(stream)
	})

	go func() {
		testLogger.Fatal(http.ListenAndServe(":9999", nil))
	}()
}

func handleStream(stream *Stream) {
	for {
		b := make([]byte, 2048)
		size, err := stream.Read(b)
		if err != nil {
			testLogger.Fatal(err)
		}
		b = b[:size]
		written, err := stream.Write(b)
		testLogger.Printf("handler: wrote %d bytes", written)
		if err != nil {
			testLogger.Fatal(err)
		}
	}
}

func TestEcho(t *testing.T) {
	conn, _, err := (&websocket.Dialer{}).Dial("ws://127.0.0.1:9999", nil)
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, nil)
	stream, err := session.Open()
	if err != nil {
		t.Fatal(err)
	}
	buf := []byte("Hello")
	n, err := stream.Write(buf)
	t.Log(n)
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
	conn, _, err := (&websocket.Dialer{}).Dial("ws://127.0.0.1:9999", nil)
	if err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 0)
	for i := 0; i < 1500; i++ {
		buf = append(buf, byte(5))
	}
	final := make([]byte, 0)

	session := Client(conn, nil)
	stream, err := session.Open()
	written, err := stream.Write(buf)
	testLogger.Printf("test_echo_large: wrote %d bytes to handler", written)
	read := 0
	for read != written {
		catch := make([]byte, 100)
		size, err := stream.Read(catch)
		if err != io.EOF && err != nil {
			t.Fatal(err)
		}
		catch = catch[:size]
		final = append(final, catch...)
		testLogger.Printf("test_echo_large: received total %d bytes from handler", len(final))
		read += size
	}

	if !bytes.Equal(buf, final) {
		t.Fatal("message not consistent")
	}
}
