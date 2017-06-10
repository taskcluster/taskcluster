package whclient

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

// Authorizer is a function which accepts a string `id` and returns a
// signed JWT (JSON Web Token). If an error occurs, the
// return values must be ("", ErrorGenerated).
type Authorizer func(id string) (string, error)

// Config is used for creating a new client.
type Config struct {
	// ID is the worker-id of the client. This field must match the "tid" claim of the
	// JWT.
	ID string

	// ProxyAddr is the websocket address of the proxy to which the client should connect.
	ProxyAddr string

	// Logger is an optional field. This logger is passed to the session created by
	// the GetListener method. This defaults to `&util.NilLogger{}`.
	Logger util.Logger

	Authorize Authorizer

	// Retry contains the retry parameters to use in case of reconnects.
	// The default values are specified in RetryConfig.
	Retry RetryConfig
}

type clientState int

const (
	stateInit clientState = iota
	stateRunning
	stateBroken
	stateClosed
)

// Client implements net.Listener. Client connects to the specified proxy and
// provides a net.Listener interface.
type client struct {
	// read only values
	// these are never changed. Will not cause data races.
	id        string
	proxyAddr string
	authorize Authorizer
	logger    util.Logger
	retry     RetryConfig

	// hold lock to modify invariants
	m sync.Mutex

	// invariants
	acceptErr error
	token     string
	session   *wsmux.Session
	state     clientState

	// session will be non-nil only if state is stateRunning.
	// if state is {stateBroken, stateClosed}, then session will not be accessed.
	// Accept is the only function which may set the state to stateBroken.
	// reconnect is the only function which may set the state to stateRunning.

	// token can be accessed only through connectWithRetry
}

func New(config Config) (net.Listener, error) {
	cl := &client{
		// read only values
		id:        config.ID,
		proxyAddr: config.ProxyAddr,
		logger:    config.Logger,
		authorize: config.Authorize,
		retry:     config.Retry.defaultValues(),

		token:   "",
		session: nil,
		state:   stateInit,
	}

	if cl.authorize == nil {
		return nil, ErrAuthorizerNotProvided
	}

	if cl.logger == nil {
		cl.logger = &util.NilLogger{}
	}

	cl.m.Lock()
	defer cl.m.Unlock()
	conn, err := cl.connectWithRetry()
	if err != nil {
		return nil, err
	}

	sessionConfig := wsmux.Config{
		Log:              cl.logger,
		StreamBufferSize: 4 * 1024,
	}

	cl.session = wsmux.Client(conn, sessionConfig)
	cl.state = stateRunning
	return cl, nil
}

func (c *client) Accept() (net.Conn, error) {
	c.m.Lock()
	if c.state == stateClosed || c.state == stateBroken {
		defer c.m.Unlock()
		// acceptErr must be non nil when state is {stateClosed, stateBroken}
		return nil, c.acceptErr
	}

	stream, err := c.session.Accept()
	if err != nil {
		// problem with session
		// close session and attempt reconnect
		// set client error to reconnecting
		c.acceptErr = ErrClientReconnecting
		c.state = stateBroken
		// reconnect after mutex release
		defer c.reconnect()
		// next call to accept cannot enter critical section until reconnect finishes executing
		defer c.m.Unlock()
		return nil, c.acceptErr
	}

	c.m.Unlock()
	return stream, nil
}

func (c *client) Close() error {
	c.m.Lock()
	defer c.m.Unlock()

	if c.session != nil {
		_ = c.session.Close()
		c.session = nil
	}

	c.acceptErr = ErrClientClosed
	c.state = stateClosed

	return nil
}

func (c *client) Addr() net.Addr {
	c.m.Lock()
	defer c.m.Unlock()
	if c.session != nil {
		return c.session.Addr()
	}
	return nil
}

func (c *client) connectWithRetry() (*websocket.Conn, error) {
	// if token is expired or not usable, get a new token from the authorizer
	if !util.IsTokenUsable(c.token) {
		token, err := c.authorize(c.id)
		if err != nil {
			return nil, err
		}
		if !util.IsTokenUsable(token) {
			return nil, ErrBadToken
		}
		c.token = token
	}

	// initial connection
	addr := strings.TrimSuffix(c.proxyAddr, "/") + "/register/" + c.id
	header := make(http.Header)
	header.Set("Authorization", "Bearer "+c.token)
	// initial attempt
	conn, res, err := websocket.DefaultDialer.Dial(addr, header)
	if err != nil {
		if shouldRetry(res) {
			// retry connection and return result
			return c.retryConn()
		}
		return nil, ErrRetryFailed
	}
	return conn, err
}

func (c *client) retryConn() (*websocket.Conn, error) {
	addr := strings.TrimSuffix(c.proxyAddr, "/") + "/register/" + c.id
	header := make(http.Header)
	header.Set("Authorization", "Bearer "+c.token)

	currentDelay := c.retry.InitialDelay
	maxTimer := time.After(c.retry.MaxElapsedTime)
	backoff := time.After(currentDelay)

	for {
		select {
		case <-maxTimer:
			return nil, ErrRetryTimedOut
		case <-backoff:
			conn, res, err := websocket.DefaultDialer.Dial(addr, header)
			if err == nil {
				return conn, nil
			}
			if !shouldRetry(res) {
				return nil, ErrRetryFailed
			}

			currentDelay = c.retry.NextDelay(currentDelay)
			backoff = time.After(currentDelay)
		}
	}

}

func (c *client) reconnect() {
	c.m.Lock()
	defer c.m.Unlock()
	conn, err := c.connectWithRetry()
	if err != nil {
		// set error and return
		c.acceptErr = ErrRetryFailed
		return
	}

	if c.session != nil {
		_ = c.session.Close()
		c.session = nil
	}

	sessionConfig := wsmux.Config{
		Log:              c.logger,
		StreamBufferSize: 4 * 1024,
	}
	c.session = wsmux.Client(conn, sessionConfig)
	c.state = stateRunning
	c.acceptErr = nil
}

// simple utility
func shouldRetry(r *http.Response) bool {
	// not sure if !(r == nil || r.StatusCode == 4xx) would cause dereferencing error
	if r == nil {
		return false
	}
	if r.StatusCode/100 == 4 || r.StatusCode/100 == 2 {
		return false
	}
	return true
}
