package main

import (
	"log"
	"net/http"
	"os"

	whproxy "github.com/taskcluster/webhooktunnel/proxy"
)

// starts proxy on a random port on the system
func main() {
	proxy := whproxy.NewProxy(whproxy.Config{
		Logger: log.New(os.Stdout, "proxy", log.Lshortfile),
	})

	done := make(chan bool, 1)
	server := &http.Server{Addr: ":9999", Handler: proxy.GetHandler()}
	go func() {
		_ = server.ListenAndServe()
		done <- true
	}()
	defer func() {
		_ = server.Close()
	}()

	log.Printf("proxy listening on %s", server.Addr)
	<-done
}
