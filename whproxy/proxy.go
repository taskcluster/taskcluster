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
	registerRe = regexp.MustCompile("^/register/(\\w+)/?$")
	serveRe    = regexp.MustCompile("^/(\\w+)/?(.*)$")
)

// Config for Proxy. Accepts a websocket.Upgrader and a Logger.
// Default value for Upgrade ReadBufferSize and WriteBufferSize is 1024 bytes.
// Default Logger is NilLogger.
type Config struct {
	Upgrader websocket.Upgrader
	Logger   util.Logger
}

// Proxy is used to send http and ws requests to workers.
// New proxy can be created by using whproxy.New()
type Proxy struct {
	m               sync.RWMutex
	pool            map[string]*wsmux.Session
	upgrader        websocket.Upgrader
	logger          util.Logger
	handler         http.Handler
	onSessionRemove func(string)
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
		if registerRe.MatchString(r.URL.Path) { // matches "/register/(\w+)/?$"
			id := registerRe.FindStringSubmatch(r.URL.Path)[1]
			p.register(w, r, id)
		} else if serveRe.MatchString(r.URL.Path) { // matches "/{id}/{path}"
			matches := serveRe.FindStringSubmatch(r.URL.Path)
			id, path := matches[1], matches[2]
			p.serveRequest(w, r, id, path)
		} else { // if not register request or worker request, not found
			http.NotFound(w, r)
		}
	})

	return p
}

// SetSessionRemoveHandler which is set when a wsmux Session is removed from the proxy.
func (p *Proxy) SetSessionRemoveHandler(h func(string)) {
	p.m.Lock()
	defer p.m.Unlock()
	p.onSessionRemove = h
}

// ServeHTTP implements http.Handler
func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	p.handler.ServeHTTP(w, r)
}

// getWorkerSession returns true if a session with the given id is present
func (p *Proxy) getWorkerSession(id string) (*wsmux.Session, bool) {
	p.m.RLock()
	defer p.m.RUnlock()
	s, ok := p.pool[id]
	return s, ok
}

// removeWorker is an idempotent operation which deletes a worker from the proxy's
// worker pool
func (p *Proxy) removeWorker(id string) {
	p.m.Lock()
	defer p.m.Unlock()
	delete(p.pool, id)
	p.logger.Printf("worker with id %s removed from proxy", id)
}

// register is used to connect a worker to the proxy so that it can start serving API endpoints.
// The request must contain the worker ID in the url.
// The request is validated by the proxy and the http connection is upgraded to websocket.
func (p *Proxy) register(w http.ResponseWriter, r *http.Request, id string) {
	if !websocket.IsWebSocketUpgrade(r) {
		http.NotFound(w, r)
		return
	}

	if err := p.validateRequest(r); err != nil {
		http.Error(w, http.StatusText(400), 400)
		return
	}

	p.m.Lock()
	if _, ok := p.pool[id]; ok {
		p.m.Unlock()
		http.Error(w, http.StatusText(400), 400)
		return
	}
	// add sentinel value
	p.pool[id] = &wsmux.Session{}
	p.m.Unlock()

	conn, err := p.upgrader.Upgrade(w, r, nil)
	if err != nil {
		panic(err)
	}

	// generate config
	conf := wsmux.Config{
		StreamBufferSize: 64 * 1024,
		CloseCallback: func() {
			p.removeWorker(id)
			if p.onSessionRemove != nil {
				p.onSessionRemove(id)
			}
		},
		Log: p.logger,
	}

	p.m.Lock()
	defer p.m.Unlock()
	p.pool[id] = wsmux.Server(conn, conf)
}

// serveRequest serves worker endpoints to viewers
func (p *Proxy) serveRequest(w http.ResponseWriter, r *http.Request, id string, path string) {
	session, ok := p.getWorkerSession(id)

	// 404 if worker is not registered on this proxy
	if !ok {
		// DHT code will be added here
		http.Error(w, "worker not found", 404)
		return
	}

	// Open a stream to the worker session
	reqStream, err := session.Open()
	if err != nil {
		http.Error(w, "could not connect to the worker", 500)
		return
	}

	// set original path as header
	r.Header.Set("x-webhooktunnel-original-path", r.URL.Path)

	// check for a websocket request
	if websocket.IsWebSocketUpgrade(r) {
		_ = websocketProxy(w, r, reqStream, p.upgrader)
		return
	}

	// rewrite path for worker and write request
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
	for k := range w.Header() {
		w.Header().Del(k)
	}
	for k, v := range resp.Header {
		w.Header()[k] = v
	}

	// dump headers
	w.WriteHeader(resp.StatusCode)

	// stream body to viewer
	if resp.Body != nil {
		_, err := io.Copy(w, resp.Body)
		if err != nil {
			return
		}
	}
}
