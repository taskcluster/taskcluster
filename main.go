package main

import (
	log "github.com/sirupsen/logrus"
	"net/http"
	"os"

	"github.com/taskcluster/webhooktunnel/whproxy"
)

var logger = &log.Logger{
	Out:       os.Stdout,
	Formatter: new(log.TextFormatter),
	Level:     log.DebugLevel,
}

// starts proxy on a random port on the system
func main() {
	proxy := whproxy.New(whproxy.Config{Logger: logger})

	port := os.Getenv("TASKCLUSTER_PROXY_PORT")
	if port == "" {
		port = "9999"
	}
	// TODO: Read TLS config
	server := &http.Server{Addr: ":" + port, Handler: proxy.GetHandler()}
	defer func() {
		_ = server.Close()
	}()
	logger.Printf("starting server on %s", server.Addr)
	_ = server.ListenAndServe()
}
