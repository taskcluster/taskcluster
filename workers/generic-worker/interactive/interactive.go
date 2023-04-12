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

	"github.com/gorilla/websocket"
)

var upgrader = &websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Interactive struct {
	TCPPort      uint16
	conn         connWrapper
	stdin        io.WriteCloser
	stdout       io.ReadCloser
	stderr       io.ReadCloser
	cmd          *exec.Cmd
	done         chan struct{}
	ioCopyErrors chan error
	ctx          context.Context
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

func New(port uint16, ctx context.Context) (it *Interactive, err error) {
	it = &Interactive{
		TCPPort: port,
		cmd:     exec.Command("bash"),
		done:    make(chan struct{}),
		ctx:     ctx,
	}

	it.stdin, err = it.cmd.StdinPipe()
	if err != nil {
		log.Printf("StdinPipe error: %v", err)
		return nil, err
	}

	it.stdout, err = it.cmd.StdoutPipe()
	if err != nil {
		log.Printf("StdoutPipe error: %v", err)
		return nil, err
	}

	it.stderr, err = it.cmd.StderrPipe()
	if err != nil {
		log.Printf("StderrPipe error: %v", err)
		return nil, err
	}

	return
}

func (it *Interactive) Handler(w http.ResponseWriter, r *http.Request) {
	// Upgrade the incoming request to a WebSocket connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		http.Error(w, "WebSocket upgrade error", http.StatusInternalServerError)
		return
	}
	it.conn = connWrapper{conn, &sync.Mutex{}}
	defer func() {
		log.Println("Closing WebSocket connection")
		if err := it.conn.Close(); err != nil {
			log.Printf("WebSocket close error: %v", err)
		}
		log.Println("Handler finished")
	}()

	it.copyCommandOutputStreams()

	if err := it.cmd.Start(); err != nil {
		log.Printf("Command start error: %v", err)
		http.Error(w, "Command start error", http.StatusInternalServerError)
		return
	}

	msgChan := make(chan []byte)
	go it.handleWebsocketMessages(msgChan)

	select {
	case <-it.ctx.Done():
		log.Println("Exiting out of interactive session")
	case <-it.done:
		log.Println("Exiting out of interactive session")
	}
}

func (it *Interactive) handleWebsocketMessages(msgChan chan []byte) {
	defer close(it.done)

	for {
		select {
		case <-it.ctx.Done():
			log.Println("Exiting out of websockerIOErrors")
			return
		case err := <-it.ioCopyErrors:
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
					log.Println("WebSocket closed normally")
				} else {
					log.Printf("io.Copy error: %v", err)
				}
				return
			}
		case msg := <-msgChan:
			if err := it.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Printf("WriteMessage error: %v", err)
				return
			}
		default:
			// ReadMessage blocks until a message is received.
			// SetReadLimit to 0 for non-blocking read.
			it.conn.SetReadLimit(0)
			msgType, msg, err := it.conn.ReadMessage()
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
					log.Println("WebSocket closed normally")
					return
				} else {
					log.Printf("ReadMessage error: %v", err)
					return
				}
			}
			if msgType != websocket.TextMessage {
				continue
			}
			msgChan <- msg
		}
	}
}

func (it *Interactive) copyCommandOutputStreams() {
	it.ioCopyErrors = make(chan error, 3)

	go func() {
		log.Println("io.Copy conn -> stdout started")
		_, err := io.Copy(it.conn, it.stdout)
		log.Println("io.Copy conn -> stdout finished")
		it.ioCopyErrors <- err
	}()

	go func() {
		log.Println("io.Copy conn -> stderr started")
		_, err := io.Copy(it.conn, it.stderr)
		log.Println("io.Copy conn -> stderr finished")
		it.ioCopyErrors <- err
	}()

	go func() {
		log.Println("io.Copy stdin -> conn started")
		_, err := io.Copy(it.stdin, it.conn)
		log.Println("io.Copy stdin -> conn finished")
		it.ioCopyErrors <- err
	}()
}

func (it *Interactive) ListenAndServe() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", it.Handler)
	server := http.Server{
		Addr:    fmt.Sprintf(":%d", it.TCPPort),
		Handler: mux,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("ListenAndServe() error: %v", err)
		}
	}()

	select {
	case <-it.ctx.Done():
		log.Println("Server done, shutting down")
	case <-it.done:
		log.Println("Server done, shutting down")
	}

	if err := server.Shutdown(ctx); err != nil {
		return fmt.Errorf("server shutdown failed: %v", err)
	}
	if err := it.cmd.Process.Kill(); err != nil {
		return fmt.Errorf("kill process failed: %v", err)
	}

	return nil
}

func (it *Interactive) Terminate() error {
	if err := it.stdout.Close(); err != nil {
		log.Printf("StdoutPipe close error: %v", err)
	}
	if err := it.stderr.Close(); err != nil {
		log.Printf("StderrPipe close error: %v", err)
	}
	if err := it.stdin.Close(); err != nil {
		log.Printf("StdinPipe close error: %v", err)
	}

	// no process is running, so there is nothing to terminate
	if it.cmd.Process == nil {
		return nil
	}

	return it.cmd.Process.Kill()
}
