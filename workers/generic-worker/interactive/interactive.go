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

	"github.com/gorilla/websocket"
	"github.com/taskcluster/slugid-go/slugid"
)

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
	cmd     CreateInteractiveProcess
}

type CreateInteractiveProcess func() (*exec.Cmd, error)

func New(port uint16, cmd CreateInteractiveProcess, ctx context.Context) (it *Interactive, err error) {
	it = &Interactive{
		TCPPort: port,
		secret:  slugid.Nice(),
		cmd:     cmd,
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

	itj, err := CreateInteractiveJob(it.cmd, conn, it.ctx)
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
