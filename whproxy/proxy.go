package whproxy

import (
	"bufio"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/dgrijalva/jwt-go"
	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

const (
	monthUnix = 31 * 24 * time.Hour
)

// Config contains the run time parameters for the proxy
type Config struct {
	// Upgrader is a websocket.Upgrader instance which is used to upgrade incoming
	// websocket connections from Clients.
	Upgrader websocket.Upgrader

	// Logger is used to log proxy events. Refer util.Logger.
	Logger util.Logger

	// JWTSecretA and JWTSecretB are used by the proxy to verify JWTs from Clients.
	JWTSecretA []byte
	JWTSecretB []byte
	// Domain where proxy will be hosted
	Domain string
}

// proxy is used to send http and ws requests to workers.
// New proxy can be created by using whproxy.New()
type proxy struct {
	m               sync.RWMutex
	pool            map[string]*wsmux.Session
	upgrader        websocket.Upgrader
	logger          util.Logger
	onSessionRemove func(string)
	jwtSecretA      []byte
	jwtSecretB      []byte
	domain          string
}

// regex for parsing requests
var (
	registerRe = regexp.MustCompile("^/register/([\\w-]+)/?$")
	serveRe    = regexp.MustCompile("^/([\\w-]+)/(.*)$")
)

// New creates a new proxy instance and wraps it as an http.Handler.
func New(conf Config) (http.Handler, error) {
	return newProxy(conf)
}

// ServeHTTP implements http.Handler so that the proxy may be used as a handler in a Mux or http.Server
func (p *proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {

	// check for path style
	// eg. domain = "tcproxy.net", req url = "https://tcproxy.net/.../"
	// host may be of the form "host:port"
	// register requests can only be path style
	p.logf("", r.RemoteAddr, "Host=%s Path=%s", r.Host, r.URL.Path)
	if strings.HasPrefix(r.Host, p.domain) {
		// register will be matched first
		if registerRe.MatchString(r.URL.Path) { // matches "/register/(\w+)/?$"
			id := registerRe.FindStringSubmatch(r.URL.Path)[1]
			tokenString := util.ExtractJWT(r.Header.Get("Authorization"))
			p.register(w, r, id, tokenString)
			return
		}

		s := strings.TrimPrefix(r.URL.Path, "/")
		index := strings.Index(s, "/")
		id, path := "", "/"
		if index < 0 {
			id = s
		} else {
			id = s[:index]
			path = s[index:]
		}
		if id == "" {
			http.NotFound(w, r)
			return
		}
		p.serveRequest(w, r, id, path)
		return
	}

	// if address has port, strip port
	host := r.Host
	index := strings.Index(host, ":")
	if index > 0 {
		host = host[:index]
	}
	if strings.HasSuffix(host, "."+p.domain) {
		index := strings.Index(r.Host, ".")
		id := r.Host[:index]
		path := r.URL.Path
		if id == "" {
			http.NotFound(w, r)
			return
		}
		p.serveRequest(w, r, id, path)
		return
	}

	http.NotFound(w, r)
}

func newProxy(conf Config) (*proxy, error) {
	p := &proxy{
		pool:       make(map[string]*wsmux.Session),
		upgrader:   conf.Upgrader,
		logger:     conf.Logger,
		jwtSecretA: conf.JWTSecretA,
		jwtSecretB: conf.JWTSecretB,
		domain:     conf.Domain,
	}

	if p.jwtSecretA == nil || p.jwtSecretB == nil {
		p.logerrorf("", "", "could not load secrets")
		return nil, ErrMissingSecret
	}

	if p.logger == nil {
		p.logger = &util.NilLogger{}
	}

	return p, nil

}

// setSessionRemoveHandler sets a function which is called when a wsmux Session is removed from
// the proxy due to closure or error.
func (p *proxy) setSessionRemoveHandler(h func(string)) {
	p.m.Lock()
	defer p.m.Unlock()
	p.onSessionRemove = h
}

// getWorkerSession returns true if a session with the given id is present
func (p *proxy) getWorkerSession(id string) (*wsmux.Session, bool) {
	p.m.RLock()
	defer p.m.RUnlock()
	s, ok := p.pool[id]
	return s, ok
}

// removeWorker is an idempotent operation which deletes a worker from the proxy's
// worker pool
func (p *proxy) removeWorker(id string) {
	p.m.Lock()
	defer p.m.Unlock()
	delete(p.pool, id)
	p.logf(id, "", "session removed")
}

// register is used to connect a worker to the proxy so that it can start serving API endpoints.
// The request must contain the worker ID in the url.
// The request is validated by the proxy and the http connection is upgraded to websocket.
func (p *proxy) register(w http.ResponseWriter, r *http.Request, id, tokenString string) {

	p.logf(id, r.RemoteAddr, "requesting client registration")
	if tokenString == "" {
		// No jwt. Connection not authorized
		p.logerrorf(id, r.RemoteAddr, "could not retreive auth token")
		http.Error(w, http.StatusText(400), 400)
		return
	}

	if !websocket.IsWebSocketUpgrade(r) {
		p.logerrorf(id, r.RemoteAddr, "request must be websocket upgrade")
		http.NotFound(w, r)
		return
	}

	// validation does not require lock
	if err := p.validateJWT(id, tokenString); err != nil {
		p.logerrorf(id, r.RemoteAddr, "unable to validate token: %v", err)
		http.Error(w, http.StatusText(400), 400)
		return
	}

	// we should lock while upgrading
	// otherwise there could be a possible race condition
	p.m.Lock()
	defer p.m.Unlock()

	// remove old session and allow new connection
	session := p.pool[id]

	// remove the close callback so that functions are not accidentally called
	if session != nil {
		p.logf(id, r.RemoteAddr, "removed previous session")
		session.SetCloseCallback(nil)
	}
	// unlock and close old session while upgrading
	if session != nil {
		_ = session.Close()
	}

	delete(p.pool, id)

	conn, err := p.upgrader.Upgrade(w, r, nil)
	if err != nil {
		p.logger.Print(err)
		return
	}

	// generate config
	conf := wsmux.Config{
		StreamBufferSize: 4 * 1024,
		CloseCallback: func() {
			p.removeWorker(id)
			if p.onSessionRemove != nil {
				p.onSessionRemove(id)
			}
		},
		// Log: p.logger,
	}

	p.pool[id] = wsmux.Server(conn, conf)
	p.logf(id, r.RemoteAddr, "added new session for worker")
}

// serveRequest serves worker endpoints to viewers
func (p *proxy) serveRequest(w http.ResponseWriter, r *http.Request, id string, path string) {
	// log new request arrival
	p.logf(id, r.RemoteAddr, "request: host=%s path=%s", r.Host, path)

	session, ok := p.getWorkerSession(id)

	// 404 if worker is not registered on this proxy
	if !ok {
		// DHT code will be added here
		p.logerrorf(id, r.RemoteAddr, "could not find requested worker")
		http.Error(w, http.StatusText(404), 404)
		return
	}

	// set original path as header
	r.Header.Set("x-webhooktunnel-original-path", r.URL.Path)

	// check for a websocket request
	if websocket.IsWebSocketUpgrade(r) {
		_ = p.websocketProxy(w, r, session, id)
		return
	}

	// Open a stream to the worker session
	r.URL.Path = path
	p.logf(id, r.RemoteAddr, "attempting to open new stream")
	reqStream, streamID, err := session.Open()
	if err != nil {
		p.logerrorf(id, r.RemoteAddr, "could not open stream: path=%s", path)
		http.Error(w, http.StatusText(500), 500)
		return
	}
	p.logf(id, r.RemoteAddr, "opened new stream: ID=%d", streamID)

	// rewrite path for worker and write request
	err = r.Write(reqStream)
	if err != nil {
		p.logerrorf(id, r.RemoteAddr, "could not write request: path=%s", path)
		http.Error(w, http.StatusText(500), 500)
		return
	}

	// read response from worker
	bufReader := bufio.NewReader(reqStream)
	resp, err := http.ReadResponse(bufReader, r)
	if err != nil {
		p.logerrorf(id, r.RemoteAddr, "could not read response: path=%s", path)
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
	if resp.Body == nil {
		return
	}

	// stream body to viewer and close wsmux stream
	defer func() {
		_ = reqStream.Close()
	}()

	flusher, ok := w.(http.Flusher)
	// flusher may not be implemented by a ResponseWriter wrapper
	// simple copy
	if !ok {
		n, err := io.Copy(w, resp.Body)
		p.logf(id, r.RemoteAddr, "data transfered over request: %d bytes, error: %v", n, err)
		// log here
		return
	}

	p.logf(id, r.RemoteAddr, "streaming http")
	wf := &threadSafeWriteFlusher{w: w, f: flusher}
	n, err := copyAndFlush(wf, resp.Body, 100*time.Millisecond)
	p.logf(id, r.RemoteAddr, "data transfered over request: %d bytes, error: %v", n, err)
}

// validate jwt
// jwt signing and verification algorithm must be HMAC
func (p *proxy) validateJWT(id string, tokenString string) error {
	// parse jwt token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrUnexpectedSigningMethod
		}
		return p.jwtSecretA, nil
	})

	if err != nil {
		// log first error
		p.logerrorf(id, "", "%v: trying with second secret", err)

		token, err = jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, ErrUnexpectedSigningMethod
			}
			return p.jwtSecretB, nil
		})
	}

	if err != nil {
		p.logerrorf(id, "", "%v: auth failed", err)
		return ErrAuthFailed
	}

	// check claims
	now := time.Now().Unix()
	claims, ok := token.Claims.(jwt.MapClaims)

	if !ok {
		p.logerrorf(id, "", "%v: could not parse claims", err)
		return ErrTokenNotValid
	}
	p.logf(id, "", "claims: %v", claims)

	if !claims.VerifyExpiresAt(now, true) {
		p.logerrorf(id, "", "%v", err)
		return ErrAuthFailed
	}
	if !claims.VerifyIssuedAt(now, true) {
		p.logerrorf(id, "", "%v", err)
		return ErrAuthFailed
	}
	if !claims.VerifyNotBefore(now, true) {
		p.logerrorf(id, "", "%v", err)
		return ErrAuthFailed
	}
	if claims["tid"] != id {
		p.logerrorf(id, "", "%v", err)
		return ErrAuthFailed
	}

	if claims["exp"].(float64)-claims["nbf"].(float64) > float64(monthUnix) {
		p.logerrorf(id, "", "jwt should not be valid for more than 31 days")
		return ErrAuthFailed
	}

	return nil
}

// proxy logging utilities
const (
	fmtString      = "[PROXY] INFO: id=%s remote_ip=%s "
	fmtErrorString = "[PROXY] ERROR: id=%s remote_ip=%s "
)

// NOTE: cannot use logrus methods
func (p *proxy) logf(id string, remoteAddr string, format string, v ...interface{}) {
	args := []interface{}{id, remoteAddr}
	args = append(args, v...)
	p.logger.Printf(fmtString+format, args...)
}

func (p *proxy) logerrorf(id string, remoteAddr string, format string, v ...interface{}) {
	args := []interface{}{id, remoteAddr}
	args = append(args, v...)
	p.logger.Printf(fmtErrorString+format, args...)
}
