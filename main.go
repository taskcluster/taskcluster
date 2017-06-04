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

	server := &http.Server{Addr: ":9999", Handler: proxy.GetHandler()}
	defer func() {
		_ = server.Close()
	}()
	log.Printf("starting server on %s", server.Addr)
	server.ListenAndServe()
}
