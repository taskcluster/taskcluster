package proxy

import (
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
	// remove workerID from request path
	r.URL.Path = replaceID(r.URL.Path)
	r.URL.Host = "ignored"
	log.Printf("rewritten path: %s", r.URL.Path)
	err = r.Write(reqStream)
	if err != nil {
		http.Error(w, "internal server error", 500)
		return
	}

	// cannot set headers in response, so hijack the connection
	// and write the raw response
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "unable to send response", 500)
		return
	}
	rawConn, _, err := hj.Hijack()
	if err != nil {
		http.Error(w, "unable to send response", 500)
		return
	}
	// setup a two way stream, in case a websocket connection was established
	go log.Printf("write closed with error: %v", copyAndClose(rawConn, reqStream))
	go log.Printf("read closed with error: %v", copyAndClose(reqStream, rawConn))
}
