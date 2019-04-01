package wsproxy

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	jwt "github.com/dgrijalva/jwt-go"
	"github.com/gorilla/websocket"
	"github.com/taskcluster/websocktunnel/util"
	"github.com/taskcluster/websocktunnel/wsmux"

	"github.com/sirupsen/logrus"
	nullLog "github.com/sirupsen/logrus/hooks/test"
)

const (
	monthUnix = 31 * 24 * time.Hour
)

var (
	clientIdRe = regexp.MustCompile(`^[a-zA-Z0-9_~.%-]+$`)
)

// Config contains the run time parameters for the proxy
type Config struct {
	// Upgrader is a websocket.Upgrader instance which is used to upgrade incoming
	// websocket connections from Clients.
	Upgrader websocket.Upgrader

	// Logger is used to log proxy events. Refer util.Logger.
	Logger *logrus.Logger

	// JWTSecretA and JWTSecretB are used by the proxy to verify JWTs from Clients.
	JWTSecretA []byte
	JWTSecretB []byte

	// Domain and port where proxy will be hosted
	Domain string
	Port   int

	// set to true if serving with TLS
	TLS bool

	// Audience value for aud claim
	Audience string
}

// proxy is used to send http and ws requests to a registered client.
// New proxy can be created by using wsproxy.New()
type proxy struct {
	m               sync.RWMutex
	pool            map[string]*wsmux.Session
	upgrader        websocket.Upgrader
	logger          *logrus.Logger
	onSessionRemove func(string)
	jwtSecretA      []byte
	jwtSecretB      []byte
	domain          string
	port            int
	tls             bool
	audience        string
}

// New creates a new proxy instance and wraps it as an http.Handler.
func New(conf Config) (http.Handler, error) {
	return newProxy(conf)
}

// ServeHTTP implements http.Handler so that the proxy may be used as a handler in a Mux or http.Server
func (p *proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	p.logf("", r.RemoteAddr, "Host=%s Path=%s", r.Host, r.URL.Path)

	// Client registration requests are a GET of path / with some headers set
	if path, id := r.URL.Path, r.Header.Get("x-websocktunnel-id"); id != "" && path == "/" {
		tokenString := util.ExtractJWT(r.Header.Get("Authorization"))
		p.register(w, r, id, tokenString)
		return
	}

	// try to match viewer requests to https://<domain>/<id>/<path> (ignoring
	// the host field)
	s := strings.TrimPrefix(r.URL.RequestURI(), "/")
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
}

func newProxy(conf Config) (*proxy, error) {
	p := &proxy{
		pool:       make(map[string]*wsmux.Session),
		upgrader:   conf.Upgrader,
		logger:     conf.Logger,
		jwtSecretA: conf.JWTSecretA,
		jwtSecretB: conf.JWTSecretB,
		domain:     conf.Domain,
		port:       conf.Port,
		tls:        conf.TLS,
		audience:   conf.Audience,
	}

	if conf.Port == 0 {
		panic("no port specified")
	}

	if len(p.jwtSecretA) == 0 || len(p.jwtSecretB) == 0 {
		panic("wsproxy: missing secrets")
	}

	if p.logger == nil {
		logger, _ := nullLog.NewNullLogger()
		p.logger = logger
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

// removeTunnel is an idempotent operation which deletes a client session from the proxy's
// pool
func (p *proxy) removeTunnel(id string) {
	p.m.Lock()
	defer p.m.Unlock()
	delete(p.pool, id)
	p.logf(id, "", "session removed")
}

// register is used to connect a client to the proxy so that it can start serving API endpoints.
// The request must contain the tunnel ID in the url.
// The request is validated by the proxy and the http connection is upgraded to websocket.
func (p *proxy) register(w http.ResponseWriter, r *http.Request, id, tokenString string) {
	if !clientIdRe.MatchString(id) {
		p.logerrorf(id, r.RemoteAddr, "client ID is invalid")
		http.Error(w, http.StatusText(400), 400)
		return
	}

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
		http.Error(w, http.StatusText(401), 401)
		return
	}

	p.m.Lock()

	// remove any existing session forcibly
	for {
		existingSession := p.pool[id]
		if existingSession == nil {
			break
		}

		// If there's an existing session, unlock, close the existing session
		// (which will remove it), and try again.  Note that Session.Close is
		// properly reentrant, so two goroutines calling this at the same time
		// will not cause an issue.
		p.m.Unlock()
		_ = existingSession.Close()
		p.m.Lock()
	}

	defer p.m.Unlock()

	delete(p.pool, id)

	header := make(http.Header)

	urlScheme := "http://"
	defaultPort := 80
	if p.tls {
		urlScheme = "https://"
		defaultPort = 443
	}
	var portStr string
	if p.port != defaultPort {
		portStr = fmt.Sprintf(":%d", p.port)
	}

	url := urlScheme + p.domain + portStr + "/" + id
	header.Set("x-websocktunnel-client-url", url)
	p.logf(id, r.RemoteAddr, "sending url= %s", url)
	conn, err := p.upgrader.Upgrade(w, r, header)
	if err != nil {
		p.logger.Print(err)
		return
	}

	// generate config
	conf := wsmux.Config{
		StreamBufferSize: 4 * 1024,
		CloseCallback: func() {
			p.removeTunnel(id)
			if p.onSessionRemove != nil {
				p.onSessionRemove(id)
			}
		},
		Log: p.logger,
	}

	p.pool[id] = wsmux.Server(conn, conf)
	p.logf(id, r.RemoteAddr, "added new tunnel")
}

// serveRequest serves tunnel endpoints to viewers
func (p *proxy) serveRequest(w http.ResponseWriter, r *http.Request, id string, path string) {
	// log new request arrival
	p.logf(id, r.RemoteAddr, "request: host=%s path=%s", r.Host, path)
	p.logf(id, r.RemoteAddr, "request: URL: %v", r.URL)

	session, ok := p.getWorkerSession(id)

	// return 504 (bad gateway) if tunnel is not registered on this proxy
	if !ok {
		p.logerrorf(id, r.RemoteAddr, "could not find requested tunnel")
		http.Error(w, fmt.Sprintf("No client is connected with that id"), 504)
		return
	}

	// set original path as header
	r.Header.Set("x-websocktunnel-original-path", r.URL.Path)

	// check for a websocket request
	if websocket.IsWebSocketUpgrade(r) {
		_ = p.websocketProxy(w, r, session, id, path)
		return
	}

	// Open a stream to the tunnel session
	// path is the modified RequestURI
	reqURI, err := url.ParseRequestURI(path)
	if err != nil {
		http.Error(w, http.StatusText(500), 500)
		return
	}
	r.URL = reqURI
	p.logf(id, r.RemoteAddr, "attempting to open new stream")
	reqStream, err := session.Open()
	if err != nil {
		p.logerrorf(id, r.RemoteAddr, "could not open stream: path=%s", path)
		http.Error(w, http.StatusText(500), 500)
		return
	}

	// rewrite path for tunnel and write request
	err = r.Write(reqStream)
	if err != nil {
		p.logerrorf(id, r.RemoteAddr, "could not write request: path=%s", path)
		http.Error(w, http.StatusText(500), 500)
		return
	}

	// read response from tunnel
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
	// default parser verifies iat token if present. This can be a problem because of clocks not being
	// in sync.
	parser := &jwt.Parser{
		ValidMethods:         []string{"HS256"},
		SkipClaimsValidation: true, // Claims will be verified if token can be decoded using secret
	}

	token, err := parser.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrUnexpectedSigningMethod
		}
		return p.jwtSecretA, nil
	})

	if err != nil {
		// log first error
		p.logerrorf(id, "", "%v: trying with second secret", err)

		token, err = parser.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
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

	if !claims.VerifyAudience(p.audience, false) {
		p.logerrorf(id, "", "%v", err)
		return ErrAuthFailed
	}

	return nil
}

// proxy logging utilities

// NOTE: cannot use logrus methods
func (p *proxy) logf(id string, remoteAddr string, format string, v ...interface{}) {
	p.logger.WithFields(logrus.Fields{
		"tunnel-id":   id,
		"remote-addr": remoteAddr,
	}).Printf(format, v...)
}

func (p *proxy) logerrorf(id string, remoteAddr string, format string, v ...interface{}) {
	p.logger.WithFields(logrus.Fields{
		"tunnel-id":   id,
		"remote-addr": remoteAddr,
	}).Errorf(format, v...)
}
