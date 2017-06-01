package proxy

import (
	"bufio"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

func (p *proxy) handler(w http.ResponseWriter, r *http.Request) {
	// register a worker
	log.Printf("new request: %s", r.URL.Path)
	if strings.HasPrefix(r.URL.Path, "/register") {
		p.register(w, r)
		return
	}
	log.Printf("serving content:")
	p.serve(w, r)
}

/*
register is used to connect a worker to the proxy so that it can start serving API endpoints.
The request must be a websocket upgrade request with a header field containing x-worker-id.
The request is validated by the proxy and the http connection is upgraded to websocket.
*/
func (p *proxy) register(w http.ResponseWriter, r *http.Request) {
	if !websocket.IsWebSocketUpgrade(r) {
		http.NotFound(w, r)
		return
	}
	if err := p.validateRequest(r); err != nil {
		http.Error(w, "invalid request", 401)
		return
	}

	conn, err := p.upgrader.Upgrade(w, r, nil)
	if err != nil {
		panic(err)
	}
	id := r.Header.Get("x-worker-id")
	log.Printf("connection request for id: %s", id)
	p.addWorker(id, conn, wsmux.Config{StreamBufferSize: 64 * 1024})
}

// serve endpoints to viewers
func (p *proxy) serve(w http.ResponseWriter, r *http.Request) {
	// extract worker id from path
	wid := extractID(r.URL.Path)
	log.Printf("request for worker %s", wid)
	session, ok := p.getWorkerSession(wid)
	if !ok {
		// DHT code will be added here
		http.Error(w, "worker not found", 404)
		return
	}
	reqStream, err := session.Open()
	if err != nil {
		http.Error(w, "could not connect to the worker", 500)
		return
	}

	// check for a websocket request
	if websocket.IsWebSocketUpgrade(r) {
		_ = websocketProxy(w, r, reqStream, p.upgrader)
		return
	}

	r.URL.Path = replaceID(r.URL.Path)
	err = r.Write(reqStream)

	if err != nil {
		http.Error(w, "error sending request to worker", 500)
		return
	}

	// read response from worker
	bufReader := bufio.NewReader(reqStream)
	resp, err := http.ReadResponse(bufReader, r)
	if err != nil {
		http.Error(w, "error sending response", 500)
		return
	}

	// manually proxy response
	// clear responseWriter headers and write response headers instead
	for k, _ := range w.Header() {
		w.Header().Del(k)
	}
	for k, v := range resp.Header {
		w.Header()[k] = v
	}
	w.WriteHeader(resp.StatusCode)
	if resp.Body != nil {
		_, err := io.Copy(w, resp.Body)
		if err != nil {
			return
		}
	}
}
