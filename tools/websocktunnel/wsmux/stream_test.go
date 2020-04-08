package wsmux

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/taskcluster/websocktunnel/util"
)

func TestManyStreamEchoLarge(t *testing.T) {
	// t.Skip("skipped until deadlock is solved")
	server := httptest.NewServer(genWebSocketHandler(t, manyEchoConn))
	url := server.URL
	defer server.Close()
	conn, _, err := websocket.DefaultDialer.Dial(util.MakeWsURL(url), nil)
	if err != nil {
		t.Fatal(err)
	}
	session := Client(conn, Config{Log: genLogger()})

	buf := make([]byte, 0)
	for i := 0; i < 1500; i++ {
		buf = append(buf, byte(i%127))
	}

	var wg sync.WaitGroup
	logger := genLogger()

	sender := func(i int) {
		defer wg.Done()
		str, err := session.Open()
		id := str.(*stream).id
		if err != nil {
			panic(err)
		}

		_, err = str.Write(buf)
		if err != nil {
			panic(err)
		}

		err = str.Close()
		if err != nil {
			panic(err)
		}

		final := new(bytes.Buffer)
		_, err = io.Copy(final, str)
		if err != nil {
			panic(err)
		}

		logger.Printf("stream %d finished read. msgLen: %d, recvLen: %d", id, len(buf), final.Len())

		if !bytes.Equal(buf, final.Bytes()) {
			t.Log(len(buf), final.Len())
			panic(fmt.Sprintf("bad message on stream %d", id))
		}
	}

	for i := 0; i < maxTestStreams; i++ {
		wg.Add(1)
		go sender(i)
	}

	wg.Wait()

}

func TestReadDeadlineExpires(t *testing.T) {
	server := httptest.NewServer(genWebSocketHandler(t, timeoutConn))
	url := server.URL
	defer server.Close()
	// Open a stream and check if read expires within given time
	conn, _, err := websocket.DefaultDialer.Dial(util.MakeWsURL(url), nil)
	if err != nil {
		t.Fatal(err)
	}
	client := Client(conn, Config{})
	errChan := make(chan error, 1)
	str, err := client.Open()
	if err != nil {
		t.Fatal(err)
	}
	_ = str.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	// startTime := time.Now()
	timer := time.NewTimer(800 * time.Millisecond)
	go func() {
		b := make([]byte, 1)
		_, err := str.Read(b)
		if err == nil {
			panic("test should timeout")
		}
		errChan <- err
	}()

	select {
	case err := <-errChan:
		if err != ErrReadTimeout {
			t.Fatal("err should be ErrReadTimeout")
		}
	case <-timer.C:
		t.Fatal("read did not timeout")
	}
}

func TestReadDeadlineReset(t *testing.T) {
	server := httptest.NewServer(genWebSocketHandler(t, timeoutConn))
	url := server.URL
	defer server.Close()
	// Open a stream and check if read expires within given time
	conn, _, err := websocket.DefaultDialer.Dial(util.MakeWsURL(url), nil)
	if err != nil {
		t.Fatal(err)
	}
	client := Client(conn, Config{})
	errChan := make(chan error, 1)
	str, err := client.Open()
	if err != nil {
		t.Fatal(err)
	}
	// if read times out before short timer then fail
	short := time.NewTimer(1200 * time.Millisecond)
	// if long timer triggers before read times out then fail
	long := time.NewTimer(2500 * time.Millisecond)
	start := time.Now()
	_ = str.SetReadDeadline(start.Add(500 * time.Millisecond))
	go func() {
		b := make([]byte, 1)
		_, err := str.Read(b)
		if err == nil {
			panic(err)
		}
		errChan <- err
	}()
	time.Sleep(100 * time.Millisecond)
	_ = str.SetReadDeadline(start.Add(1500 * time.Millisecond))
	select {
	case <-short.C:
	case <-errChan:
		t.Fatal("deadline did not reset")
	}
	select {
	case err := <-errChan:
		if err != ErrReadTimeout {
			t.Fatal("wrong error")
		}
	case <-long.C:
		t.Fatal("read did not time out")
	}
}

func TestWriteDeadline(t *testing.T) {
	server := httptest.NewServer(genWebSocketHandler(t, timeoutConn))
	url := server.URL
	defer server.Close()
	// Open a stream and check if write expires within given time
	conn, _, err := websocket.DefaultDialer.Dial(util.MakeWsURL(url), nil)
	if err != nil {
		t.Fatal(err)
	}
	client := Client(conn, Config{})
	errChan := make(chan error, 1)
	str, err := client.Open()
	if err != nil {
		t.Fatal(err)
	}
	// remote buffer size is 12 bytes, so any message larger than 12 bytes
	// will cause write to block. Check for deadline
	message := make([]byte, 24)
	_ = str.SetWriteDeadline(time.Now().Add(500 * time.Millisecond))
	timer := time.NewTimer(800 * time.Millisecond)
	go func() {
		_, err := str.Write(message)
		if err == nil {
			panic("should timeout")
		}
		errChan <- err
	}()
	select {
	case <-timer.C:
		t.Fatal("test should time out")
	case err := <-errChan:
		if err != ErrWriteTimeout {
			t.Fatal("wrong err")
		}
	}
}

func TestWriteDeadlineReset(t *testing.T) {
	server := httptest.NewServer(genWebSocketHandler(t, timeoutConn))
	url := server.URL
	defer server.Close()
	// Open a stream and check if write expires within given time
	conn, _, err := websocket.DefaultDialer.Dial(util.MakeWsURL(url), nil)
	if err != nil {
		t.Fatal(err)
	}
	client := Client(conn, Config{})
	errChan := make(chan error, 1)
	str, err := client.Open()
	if err != nil {
		t.Fatal(err)
	}
	message := make([]byte, 50)
	start := time.Now()
	short := time.NewTimer(800 * time.Millisecond)
	long := time.NewTimer(1800 * time.Millisecond)
	_ = str.SetWriteDeadline(start.Add(500 * time.Millisecond))
	go func() {
		_, err := str.Write(message)
		if err == nil {
			panic("should timeout")
		}
		errChan <- err
	}()
	time.Sleep(100 * time.Millisecond)
	_ = str.SetWriteDeadline(start.Add(1500 * time.Millisecond))
	select {
	case <-short.C:
	case <-errChan:
		t.Fatal("write deadline was not reset")
	}
	select {
	case err := <-errChan:
		if err != ErrWriteTimeout {
			t.Fatal("wrong error")
		}
	case <-long.C:
		t.Fatal("write should time out")
	}
}

func TestConcurrentReadAndWrite(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		conn, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			t.Fatal(err)
		}
		session := Server(conn, Config{Log: genLogger()})
		str, err := session.Accept()
		if err != nil {
			t.Fatal(err)
		}
		_, _ = io.Copy(str, str)
		_ = str.Close()
	}

	server := httptest.NewServer(http.HandlerFunc(handler))
	defer server.Close()

	conn, _, err := websocket.DefaultDialer.Dial(util.MakeWsURL(server.URL), nil)
	if err != nil {
		t.Fatal(err)
	}

	session := Client(conn, Config{Log: genLogger()})
	str, err := session.Open()
	if err != nil {
		t.Fatal(err)
	}

	buf := make([]byte, 0)
	for i := 0; i < 1500; i++ {
		buf = append(buf, byte(i%127))
	}

	final := new(bytes.Buffer)
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		_, err := str.Write(buf)
		if err != nil {
			panic(err)
		}
		err = str.Close()
		if err != nil {
			panic(err)
		}
	}()

	go func() {
		defer wg.Done()
		_, err := io.Copy(final, str)
		if err != nil {
			panic(err)
		}
	}()

	wg.Wait()

	if !bytes.Equal(final.Bytes(), buf) {
		t.Fatal("bad message")
	}

}
