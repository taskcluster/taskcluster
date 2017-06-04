package main

import (
	"log"
	"net/http"
	"os"

	"github.com/taskcluster/webhooktunnel/whproxy"
)

// starts proxy on a random port on the system
func main() {
	proxy := whproxy.New(whproxy.Config{
		Logger: log.New(os.Stdout, "proxy", log.Lshortfile),
	})

	port := os.Getenv("TASKCLUSTER_PROXY_PORT")
	if port == "" {
		port = "9999"
	}
	// TODO: Read TLS config
	server := &http.Server{Addr: ":" + port, Handler: proxy.GetHandler()}
	defer func() {
		_ = server.Close()
	}()
	log.Printf("starting server on %s", server.Addr)
	_ = server.ListenAndServe()
}
