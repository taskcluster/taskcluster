package proxy

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

type proxy struct {
	m        sync.RWMutex
	pool     map[string]*wsmux.Session
	upgrader websocket.Upgrader
}

func NewProxy(upgrader websocket.Upgrader) *proxy {
	p := &proxy{
		pool:     make(map[string]*wsmux.Session),
		upgrader: upgrader,
	}
	return p
}

func (p *proxy) ListenAndServe(addr string) error {
	server := &http.Server{
		Addr:    addr,
		Handler: http.HandlerFunc(p.handler),
	}
	log.Printf("proxy listening on address %s", addr)
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
	log.Printf("worker with id %s registered on proxy", id)
	return nil
}
