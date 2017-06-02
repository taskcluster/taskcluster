package proxy

import (
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

type Config struct {
	Upgrader websocket.Upgrader
	Logger   util.Logger
}

type proxy struct {
	m        sync.RWMutex
	pool     map[string]*wsmux.Session
	upgrader websocket.Upgrader
	logger   util.Logger
}

func (p *proxy) GetHandler() http.Handler {
	return http.HandlerFunc(p.handler)
}

func (p *proxy) validateRequest(r *http.Request) error {
	return nil
}

func NewProxy(conf Config) *proxy {
	p := &proxy{
		pool:     make(map[string]*wsmux.Session),
		upgrader: conf.Upgrader,
		logger:   conf.Logger,
	}
	if p.logger == nil {
		p.logger = &util.NilLogger{}
	}
	return p
}

func (p *proxy) ListenAndServe(addr string) error {
	server := &http.Server{
		Addr:    addr,
		Handler: http.HandlerFunc(p.handler),
	}
	p.logger.Printf("proxy listening on address %s", addr)
	return server.ListenAndServe()
}

// hasWorker returns true if a session with the given id is present
func (p *proxy) getWorkerSession(id string) (*wsmux.Session, bool) {
	p.m.RLock()
	defer p.m.RUnlock()
	s, ok := p.pool[id]
	return s, ok
}

// AddWorker adds a new worker to the pool
func (p *proxy) addWorker(id string, conn *websocket.Conn, config wsmux.Config) error {
	p.m.Lock()
	defer p.m.Unlock()
	if _, ok := p.pool[id]; ok {
		return ErrDuplicateWorker
	}
	p.pool[id] = wsmux.Server(conn, config)
	p.logger.Printf("worker with id %s registered on proxy", id)
	return nil
}
