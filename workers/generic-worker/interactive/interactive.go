// Package interactive provides a way to run an interactive shell in a task.
package interactive

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Interactive struct {
	TCPPort  uint16
	conn     connWrapper
	upgrader *websocket.Upgrader
	stdin    io.WriteCloser
	stdout   io.ReadCloser
	stderr   io.ReadCloser
	mutex    sync.Mutex
	cmd      *exec.Cmd
	done     chan struct{}
}

type connWrapper struct {
	*websocket.Conn
	mutex *sync.Mutex
}

func (cw connWrapper) Read(b []byte) (int, error) {
	_, msg, err := cw.ReadMessage()
	if err != nil {
		return 0, err
	}
	copy(b, msg)
	return len(msg), nil
}

func (cw connWrapper) Write(b []byte) (int, error) {
	cw.mutex.Lock()
	defer cw.mutex.Unlock()
	err := cw.WriteMessage(websocket.TextMessage, b)
	if err != nil {
		return 0, err
	}
	return len(b), nil
}

func New(port uint16) *Interactive {
	return &Interactive{
		TCPPort: port,
		upgrader: &websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		cmd:  exec.Command("bash"),
		done: make(chan (struct{})),
	}
}

func (it *Interactive) Handler(w http.ResponseWriter, r *http.Request) {
	// Upgrade the incoming request to a WebSocket connection
	conn, err := it.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	it.conn = connWrapper{conn, &sync.Mutex{}}
	defer func() {
		if err := it.conn.Close(); err != nil {
			log.Println("WebSocket close error:", err)
		}
	}()

	it.stdin, err = it.cmd.StdinPipe()
	if err != nil {
		log.Println("StdinPipe error: ", err)
		return
	}
	defer func() {
		if err := it.stdin.Close(); err != nil {
			log.Println("StdinPipe close error:", err)
		}
	}()

	it.stdout, err = it.cmd.StdoutPipe()
	if err != nil {
		log.Println("StdoutPipe error: ", err)
		return
	}
	defer func() {
		if err := it.stdout.Close(); err != nil {
			log.Println("StdoutPipe close error:", err)
		}
	}()

	it.stderr, err = it.cmd.StderrPipe()
	if err != nil {
		log.Println("StderrPipe error: ", err)
		return
	}
	defer func() {
		if err := it.stderr.Close(); err != nil {
			log.Println("StderrPipe close error:", err)
		}
	}()

	ioCopyError := make(chan error)
	go func() {
		_, err := io.Copy(it.conn, it.stdout)
		ioCopyError <- err
	}()

	go func() {
		_, err := io.Copy(it.conn, it.stderr)
		ioCopyError <- err
	}()

	go func() {
		_, err := io.Copy(it.stdin, it.conn)
		ioCopyError <- err
	}()

	if err := it.cmd.Start(); err != nil {
		log.Println("Command start error: ", err)
		return
	}

	for {
		select {
		case <-it.done:
			log.Println("Exiting out of interactive session")
			return
		case err := <-ioCopyError:
			if err != nil {
				log.Println("io.Copy error: ", err)
				return
			}
		default:
			messageType, msg, err := it.conn.ReadMessage()
			if err != nil {
				log.Println("ReadMessage error: ", err)
				return
			}
			if messageType != websocket.TextMessage {
				continue
			}
			if _, err := it.stdin.Write(msg); err != nil {
				log.Println("Write error: ", err)
				return
			}
		}
	}
}

func (it *Interactive) ListenAndServe() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", it.Handler)
	server := http.Server{
		Addr:    fmt.Sprintf(":%d", it.TCPPort),
		Handler: mux,
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("ListenAndServe(): %v", err)
		}
	}()

	<-it.done

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		return fmt.Errorf("server shutdown failed: %v", err)
	}
	if err := it.cmd.Process.Kill(); err != nil {
		return fmt.Errorf("kill process failed: %v", err)
	}

	return nil
}

func (it *Interactive) Terminate() error {
	it.mutex.Lock()
	defer it.mutex.Unlock()
	close(it.done)
	// no process is running, so there is nothing to terminate
	if it.cmd.Process == nil {
		return nil
	}
	return it.cmd.Process.Kill()
}
