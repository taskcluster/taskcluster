package whproxy

import (
	"bufio"
	"io"
	"net/http"
	"regexp"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

var (
	registerRe = regexp.MustCompile("^/register/(?P<id>[\\w]+)/?$")
	serveRe    = regexp.MustCompile("^/(?P<id>[\\w]+)/?(?P<path>.*)$")
)

type Config struct {
	Upgrader websocket.Upgrader
	Logger   util.Logger
}

type Proxy struct {
	m        sync.RWMutex
	pool     map[string]*wsmux.Session
	upgrader websocket.Upgrader
	logger   util.Logger
	handler  http.Handler
}

func (p *Proxy) validateRequest(r *http.Request) error {
	return nil
}

// New returns a pointer to a new proxy instance
func New(conf Config) *Proxy {
	p := &Proxy{
		pool:     make(map[string]*wsmux.Session),
		upgrader: conf.Upgrader,
		logger:   conf.Logger,
	}

	if p.logger == nil {
		p.logger = &util.NilLogger{}
	}

	p.handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// register will be matched first
		if registerRe.MatchString(r.URL.Path) {
			id := registerRe.FindStringSubmatch(r.URL.Path)[1]
			p.register(w, r, id)
		} else if serveRe.MatchString(r.URL.Path) {
			matches := serveRe.FindStringSubmatch(r.URL.Path)
			id, path := matches[1], matches[2]
			p.serveRequest(w, r, id, path)
		} else {
			http.NotFound(w, r)
		}
	})

	return p
}

// GetHandler returns the router assosciated with the proxy
func (p *Proxy) GetHandler() http.Handler {
	return p.handler
}

// getWorkerSession returns true if a session with the given id is present
func (p *Proxy) getWorkerSession(id string) (*wsmux.Session, bool) {
	p.m.RLock()
	defer p.m.RUnlock()
	s, ok := p.pool[id]
	return s, ok
}

// addWorker adds a new worker to the pool
func (p *Proxy) addWorker(id string, conn *websocket.Conn, config wsmux.Config) error {
	p.m.Lock()
	defer p.m.Unlock()
	if _, ok := p.pool[id]; ok {
		return ErrDuplicateWorker
	}
	p.pool[id] = wsmux.Server(conn, config)
	p.logger.Printf("worker with id %s registered on proxy", id)
	return nil
}

// register is used to connect a worker to the proxy so that it can start serving API endpoints.
// The request must be a websocket upgrade request with a header field containing x-worker-id.
// The request is validated by the proxy and the http connection is upgraded to websocket.
func (p *Proxy) register(w http.ResponseWriter, r *http.Request, id string) {
	if !websocket.IsWebSocketUpgrade(r) {
		http.NotFound(w, r)
		return
	}

	if err := p.validateRequest(r); err != nil {
		http.Error(w, "invalid request", 401)
		return
	}

	if _, ok := p.getWorkerSession(id); ok {
		http.Error(w, "duplicate worker", 401)
		return
	}

	conn, err := p.upgrader.Upgrade(w, r, nil)
	if err != nil {
		panic(err)
	}

	// add worker after connection is established
	p.addWorker(id, conn, wsmux.Config{StreamBufferSize: 64 * 1024})
}

// serveRequest serves worker endpoints to viewers
func (p *Proxy) serveRequest(w http.ResponseWriter, r *http.Request, id string, path string) {
	session, ok := p.getWorkerSession(id)
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
	r.Header.Set("x-webhooktunnel-original-path", r.URL.Path)
	if websocket.IsWebSocketUpgrade(r) {
		_ = websocketProxy(w, r, reqStream, p.upgrader)
		return
	}

	r.URL.Path = "/" + path
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
