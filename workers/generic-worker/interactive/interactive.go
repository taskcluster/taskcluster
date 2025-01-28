//go:build darwin || linux || freebsd

// Package interactive provides a way to run an interactive shell in a task.
package interactive

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/slugid-go/slugid"
)

type CreateInteractiveProcess func() (*exec.Cmd, error)
type CreateInteractiveIsReadyProcess func() (*exec.Cmd, error)
type InteractiveCommands struct {
	IsReadyCmd CreateInteractiveIsReadyProcess
	InteractiveCmd CreateInteractiveProcess
}

var upgrader = &websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Interactive struct {
	TCPPort uint16
	GetURL  string
	secret  string
	ctx     context.Context
	interactiveCommands InteractiveCommands
}

func New(port uint16, interactiveCommands InteractiveCommands, ctx context.Context) (it *Interactive, err error) {
	it = &Interactive{
		TCPPort: port,
		secret:  slugid.Nice(),
		interactiveCommands: interactiveCommands,
		ctx:     ctx,
	}

	it.setRequestURL()
	os.Setenv("INTERACTIVE_ACCESS_TOKEN", it.secret)

	return
}

func (it *Interactive) Handler(w http.ResponseWriter, r *http.Request) {
	accessToken := os.Getenv("INTERACTIVE_ACCESS_TOKEN")
	secret := strings.TrimPrefix(r.URL.Path, "/shell/")
	// Authenticate the request with accessToken, this is good enough because
	// interactive shells are short-lived.
	if secret != accessToken {
		http.Error(w, "Access denied", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		http.Error(w, "WebSocket upgrade error", http.StatusInternalServerError)
		return
	}

	err = it.waitUntilReady(conn)
	if err != nil {
		log.Printf("Failed while waiting to create an interactive job, closing connection. %v", err)
		http.Error(w, "Failed to start interactive command", http.StatusInternalServerError)
		return
	}
	itj, err := CreateInteractiveJob(it.interactiveCommands.InteractiveCmd, conn, it.ctx)
	if err != nil {
		log.Printf("Error while spawning interactive job: %v", err)
		return
	}

	defer func() {
		if err := conn.Close(); err != nil {
			log.Printf("WebSocket close error: %v", err)
		}
	}()

	select {
	case <-it.ctx.Done():
	case <-itj.done:
	}
}

// If the interactive task has a `IsReadyCmd` declared, run that command until it succeeds or until timeout.
func (it *Interactive) waitUntilReady(conn *websocket.Conn) (err error){
	if it.interactiveCommands.IsReadyCmd == nil {
		return nil
	}
	conn.WriteMessage(websocket.BinaryMessage, []byte("Waiting for task to be ready."))

	last_output := []byte("")
	for i := 0; i < 20; i++ {
		var isReadyCmd *exec.Cmd
		isReadyCmd, err = it.interactiveCommands.IsReadyCmd()
		if err != nil {
			conn.WriteMessage(websocket.BinaryMessage, []byte("Invalid task ready command. This is a bug.\r\n"))
			return err
		}

		last_output, err = isReadyCmd.CombinedOutput()
		if err != nil {
			conn.WriteMessage(websocket.BinaryMessage, []byte("."))
			time.Sleep(1 * time.Second)
			continue
		}

		break
	}

	conn.WriteMessage(websocket.BinaryMessage, []byte("\r\n"))
	if err != nil {
		msg := fmt.Sprintf("Error while waiting for task to be ready: %v. Output:\r\n%s", err, last_output)
		log.Print(msg)
		conn.WriteMessage(websocket.BinaryMessage, []byte(msg))
		return err
	}

	return nil
}

func (it *Interactive) ListenAndServe(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/shell/", it.Handler)
	server := http.Server{
		Addr:    fmt.Sprintf(":%d", it.TCPPort),
		Handler: mux,
	}

	go func() {
		log.Printf("Output server listening... %s (without TLS)", server.Addr)
		err := server.ListenAndServe()
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("ListenAndServe() error: %v", err)
		}
	}()

	<-it.ctx.Done()

	if err := server.Shutdown(ctx); err != nil {
		return fmt.Errorf("server shutdown failed: %v", err)
	}

	return nil
}

func (it *Interactive) setRequestURL() {
	it.GetURL = fmt.Sprintf("http://localhost:%v/shell/%v", it.TCPPort, it.secret)
}
