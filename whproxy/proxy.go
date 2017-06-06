package whproxy

import (
	"bufio"
	"io"
	"net/http"
	"regexp"
	"sync"

	"github.com/dgrijalva/jwt-go"
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
	Upgrader  websocket.Upgrader
	Logger    util.Logger
	JWTSecret []byte
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
	jwtSecret       []byte
}

// validate jwt
// jwt signing and verification algorithm must be HMAC
func (p *Proxy) validateJWT(id string, tokenString string) error {
	// parse jwt token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrUnexpectedSigningMethod
		}
		return p.jwtSecret, nil
	})

	if err != nil {
		return ErrAuthFailed
	}

	// check claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return ErrTokenNotValid
	}
	if claims["sub"] != id {
		return ErrTokenNotValid
	}

	// TODO: Other validation checks
	return nil
}

// New returns a pointer to a new proxy instance
func New(conf Config) *Proxy {
	p := &Proxy{
		pool:      make(map[string]*wsmux.Session),
		upgrader:  conf.Upgrader,
		logger:    conf.Logger,
		jwtSecret: conf.JWTSecret,
	}

	if p.jwtSecret == nil {
		panic("no secret loaded")
	}

	if p.logger == nil {
		p.logger = &util.NilLogger{}
	}

	p.handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// register will be matched first
		if registerRe.MatchString(r.URL.Path) { // matches "/register/(\w+)/?$"
			id := registerRe.FindStringSubmatch(r.URL.Path)[1]
			tokenString := util.ExtractJWT(r.Header.Get("Authorization"))
			p.register(w, r, id, tokenString)

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
func (p *Proxy) register(w http.ResponseWriter, r *http.Request, id, tokenString string) {
	if !websocket.IsWebSocketUpgrade(r) {
		http.NotFound(w, r)
		return
	}

	if tokenString == "" {
		// No jwt. Connection not authorized
		http.Error(w, http.StatusText(400), 400)
		return
	}

	// we should lock while upgrading
	// otherwise there could be a possible race condition
	p.m.Lock()
	defer p.m.Unlock()

	if err := p.validateJWT(id, tokenString); err != nil {
		http.Error(w, http.StatusText(400), 400)
		return
	}
	// remove old session and allow new connection
	session := p.pool[id]
	// remove the close callback so that functions are not accidentally called
	if session != nil {
		session.SetCloseCallback(nil)
	}

	// unlock and close old session while upgrading
	go func() {
		if session != nil {
			_ = session.Close()
		}
	}()

	conn, err := p.upgrader.Upgrade(w, r, nil)
	if err != nil {
		p.logger.Print(err)
		return
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
	p.pool[id] = wsmux.Server(conn, conf)
}

// serveRequest serves worker endpoints to viewers
func (p *Proxy) serveRequest(w http.ResponseWriter, r *http.Request, id string, path string) {
	session, ok := p.getWorkerSession(id)

	// 404 if worker is not registered on this proxy
	if !ok {
		// DHT code will be added here
		http.Error(w, http.StatusText(404), 404)
		return
	}

	// Open a stream to the worker session
	reqStream, err := session.Open()
	if err != nil {
		http.Error(w, http.StatusText(500), 500)
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
		http.Error(w, http.StatusText(500), 500)
		return
	}

	// read response from worker
	bufReader := bufio.NewReader(reqStream)
	resp, err := http.ReadResponse(bufReader, r)
	if err != nil {
		http.Error(w, http.StatusText(500), 500)
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
