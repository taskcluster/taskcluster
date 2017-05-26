package main

import (
	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/client"
	"github.com/taskcluster/webhooktunnel/proxy"
	"github.com/taskcluster/webhooktunnel/wsmux"
	"log"
	"net/http"
)

func main() {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  64 * 1024,
		WriteBufferSize: 64 * 1024,
	}
	// build proxy node
	p := proxy.NewProxy(upgrader)
	// build client
	clientMux := http.NewServeMux()
	clientHandler := func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Hello, world!"))
	}
	clientMux.HandleFunc("/", clientHandler)
	c := &client.Client{
		Id:      "workerID",
		Config:  wsmux.Config{StreamBufferSize: 4 * 1024},
		Handler: clientMux,
	}
	go p.ListenAndServe(":9999")
	log.Fatal(c.ServeOnProxy("ws://127.0.0.1:9999/register"))
}
