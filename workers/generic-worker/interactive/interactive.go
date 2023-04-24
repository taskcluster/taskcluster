// Package interactive provides a way to run an interactive shell in a task.
package interactive

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
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
	conn         *websocket.Conn
	connMutex    *sync.Mutex
	stdin        io.WriteCloser
	stdout       io.ReadCloser
	stderr       io.ReadCloser
	cmd          *exec.Cmd
	done         chan struct{}
	streamErrors chan error
	ctx          context.Context
}

func New(port uint16, ctx context.Context) (it *Interactive, err error) {
	it = &Interactive{
		TCPPort:      port,
		cmd:          exec.CommandContext(ctx, "bash"),
		done:         make(chan struct{}),
		streamErrors: make(chan error, 2),
		ctx:          ctx,
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

	go it.copyCommandOutputStream(it.stdout)
	go it.copyCommandOutputStream(it.stderr)

	if err = it.cmd.Start(); err != nil {
		log.Printf("Command start error: %v", err)
		return
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
	it.conn = conn
	it.connMutex = &sync.Mutex{}
	defer func() {
		it.connMutex.Lock()
		defer it.connMutex.Unlock()
		if err := it.conn.Close(); err != nil {
			log.Printf("WebSocket close error: %v", err)
		}
	}()

	msgChan := make(chan []byte, 1)
	go it.handleWebsocketMessages(msgChan)

	select {
	case <-it.ctx.Done():
	case <-it.done:
	}
}

func (it *Interactive) handleWebsocketMessages(msgChan chan []byte) {
	for {
		select {
		case <-it.ctx.Done():
			return
		case err := <-it.streamErrors:
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
					return
				} else {
					log.Printf("streamError occured: %v", err)
					return
				}
			}
		case msg := <-msgChan:
			if _, err := it.stdin.Write(msg); err != nil {
				log.Printf("Write error: %v", err)
				return
			}
		default:
			msgType, msg, err := it.conn.ReadMessage()
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
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

func (it *Interactive) copyCommandOutputStream(stream io.ReadCloser) {
	reader := bufio.NewReader(stream)
	for {
		select {
		case <-it.ctx.Done():
			return
		default:
			msg, err := reader.ReadString('\n')
			if err != nil {
				if err == io.EOF {
					continue
				}
				it.streamErrors <- err
				return
			}
			it.connMutex.Lock()
			if err := it.conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
				it.connMutex.Unlock()
				it.streamErrors <- err
				return
			}
			it.connMutex.Unlock()
		}
	}
}

func (it *Interactive) ListenAndServe(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", it.Handler)
	server := http.Server{
		Addr:    fmt.Sprintf(":%d", it.TCPPort),
		Handler: mux,
	}

	go func() {
		var err error
		crtFile := os.Getenv("SERVER_CRT_FILE")
		keyFile := os.Getenv("SERVER_KEY_FILE")
		if crtFile != "" && keyFile != "" {
			log.Printf("Output server listening... %s (with TLS)", server.Addr)
			log.Printf("key %s ", keyFile)
			log.Printf("crt %s ", crtFile)
			err = server.ListenAndServeTLS(crtFile, keyFile)
		} else {
			log.Printf("Output server listening... %s (without TLS)", server.Addr)
			err = server.ListenAndServe()
		}
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("ListenAndServe() error: %v", err)
		}
	}()

	select {
	case <-it.ctx.Done():
	case <-it.done:
	}

	if err := server.Shutdown(ctx); err != nil {
		return fmt.Errorf("server shutdown failed: %v", err)
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
