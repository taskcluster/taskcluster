package main

import (
	"bytes"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/client"
	"github.com/taskcluster/webhooktunnel/proxy"
	"github.com/taskcluster/webhooktunnel/wsmux"
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
		if websocket.IsWebSocketUpgrade(r) {
			conn, err := upgrader.Upgrade(w, r, nil)
			if err != nil {
				log.Print("could not upgrade")
				log.Fatal(err)
			}
			mtype, buf, err := conn.ReadMessage()
			if err != nil {
				log.Fatal(err)
			}
			_ = conn.WriteMessage(mtype, buf)
			return
		}
		w.Write([]byte("Hello World!"))
	}
	clientMux.HandleFunc("/", clientHandler)
	c := &client.Client{
		Id:      "workerID",
		Config:  wsmux.Config{StreamBufferSize: 4 * 1024},
		Handler: clientMux,
	}
	log.Printf("making ws request")
	var wg sync.WaitGroup
	go p.ListenAndServe(":9999")
	wg.Add(1)
	go func() {
		defer wg.Done()
		_ = c.ServeOnProxy("ws://127.0.0.1:9999")
	}()

	// make a websocket request
	time.Sleep(200 * time.Millisecond)
	conn, _, err := websocket.DefaultDialer.Dial("ws://127.0.0.1:9999/workerID/", nil)
	if err != nil {
		log.Fatalf("cannot establish ws connection: %v", err)
	}
	_ = conn.WriteMessage(websocket.BinaryMessage, []byte("sending ws data to worker workerID"))
	_, buf, err := conn.ReadMessage()
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("ws echoed: %s", bytes.NewBuffer(buf).String())
	wg.Wait()
}
