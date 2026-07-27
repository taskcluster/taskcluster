package wsmux

import (
	"bytes"
	"io"
	"testing"

	"net/http/httptest"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/taskcluster/v102/tools/websocktunnel/util"
)

func TestEcho(t *testing.T) {
	server := httptest.NewServer(genWebSocketHandler(t, echoConn))
	url := server.URL
	defer server.Close()
	conn, _, err := (&websocket.Dialer{}).Dial(util.MakeWsURL(url), nil)
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, Config{Log: genLogger()})
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
	server := httptest.NewServer(genWebSocketHandler(t, echoConn))
	url := server.URL
	defer server.Close()
	conn, _, err := (&websocket.Dialer{}).Dial(util.MakeWsURL(url), nil)
	if err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 0)
	for i := range 1500 {
		buf = append(buf, byte(i%127))
	}

	session := Client(conn, Config{Log: genLogger()})
	// session.readDeadline = time.Now().Add(10 * time.Second)
	stream, err := session.Open()
	if err != nil {
		t.Fatal(err)
	}
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

func TestMalformedAckDoesNotPanic(t *testing.T) {
	server := httptest.NewServer(genWebSocketHandler(t, echoConn))
	defer server.Close()
	conn, _, err := (&websocket.Dialer{}).Dial(util.MakeWsURL(server.URL), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	const id = 1
	write := func(fr frame) {
		t.Helper()
		if err := conn.WriteMessage(websocket.BinaryMessage, fr.serialize()); err != nil {
			t.Fatal(err)
		}
	}
	read := func() *frame {
		t.Helper()
		for {
			mt, msg, err := conn.ReadMessage()
			if err != nil {
				t.Fatal(err)
			}
			if mt != websocket.BinaryMessage {
				continue
			}
			fr, err := deserializeFrame(msg)
			if err != nil {
				t.Fatal(err)
			}
			return fr
		}
	}

	write(newSynFrame(id))
	if fr := read(); fr.msg != msgACK {
		t.Fatalf("expected ACK for the new stream, got %v", fr)
	}

	// Send 2 bytes instead of 4 in the ACK
	write(frame{id: id, msg: msgACK, payload: []byte{0, 0}})

	write(newDataFrame(id, []byte("Hello")))
	write(newFinFrame(id))

	echoed := new(bytes.Buffer)
	for {
		fr := read()
		if fr.msg == msgFIN {
			break
		}
		if fr.msg == msgDAT {
			echoed.Write(fr.payload)
		}
	}
	if echoed.String() != "Hello" {
		t.Fatalf("expected the session to echo \"Hello\", got %q", echoed.String())
	}
}
