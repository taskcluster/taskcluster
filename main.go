package main

import (
	log "github.com/sirupsen/logrus"
	"net/http"
	"os"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/whproxy"
)

var logger = &log.Logger{
	Out:       os.Stdout,
	Formatter: new(log.TextFormatter),
	Level:     log.DebugLevel,
}

// starts proxy on a random port on the system
func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "9999"
	}
	signingSecretA := os.Getenv("TASKCLUSTER_PROXY_SECRET_A")
	signingSecretB := os.Getenv("TASKCLUSTER_PROXY_SECRET_B")
	if signingSecretA == "" || signingSecretB == "" {
		panic(whproxy.ErrMissingSecret)
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	proxy, _ := whproxy.New(whproxy.Config{
		Logger:     logger,
		Upgrader:   upgrader,
		JWTSecretA: []byte(signingSecretA),
		JWTSecretB: []byte(signingSecretB),
	})

	// TODO: Read TLS config
	server := &http.Server{Addr: ":" + port, Handler: proxy}
	defer func() {
		_ = server.Close()
	}()
	logger.Printf("starting server on %s", server.Addr)
	_ = server.ListenAndServe()
}
