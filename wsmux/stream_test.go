package wsmux

import (
	"bytes"
	"github.com/gorilla/websocket"
	"io"
	"sync"
	"testing"
)

func TestManyStreamEchoLarge(t *testing.T) {
	server := genServer(genWebSocketHandler(t, manyEchoConn), ":9999")
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
	session := Client(conn, Config{Log: genLogger("many-echo-test")})

	buf := make([]byte, 0)
	for i := 0; i < 1500; i++ {
		buf = append(buf, byte(i%127))
	}

	var wg sync.WaitGroup

	sender := func(i int) {
		defer wg.Done()
		str, err := session.Open()
		if err != nil {
			t.Fatal(err)
		}

		_, err = str.Write(buf)
		if err != nil {
			t.Fatal(err)
		}

		err = str.Close()
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

		if !bytes.Equal(buf, final) {
			t.Log(len(buf), len(final))
			t.Fatalf("bad message on stream %d", i)
		}
	}

	for i := 0; i < maxTestStreams; i++ {
		wg.Add(1)
		go sender(i)
	}

	wg.Wait()

}
