package whclient

import (
	"crypto/tls"
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

	// TLSConfig to use for authentication
	TLSConfig *tls.Config
}

type clientState int

const (
	stateRunning = iota
	stateBroken
)

//client connects to the specified proxy and
// provides a net.Listener interface.
type client struct {
	// read only values
	// these are never changed. Will not cause data races.
	id        string
	proxyAddr string
	authorize Authorizer
	logger    util.Logger
	retry     RetryConfig
	dialer    *websocket.Dialer

	// hold lock to modify invariants
	m sync.Mutex

	// invariants
	acceptErr error
	token     string
	session   *wsmux.Session
	state     clientState
	closed    chan struct{}

	// session will be non-nil only if state is stateRunning.
	// if client.closed is closed then session will not be accessed.
	// Accept is the only function which may set the state to stateBroken.
	// reconnect is the only function which may set the state to stateRunning.

	// token can be accessed only through connectWithRetry
}

// New returns a new net.Listener instance using the provided Config object.
func New(config Config) (net.Listener, error) {
	cl := &client{
		// read only values
		id:        config.ID,
		proxyAddr: config.ProxyAddr,
		logger:    config.Logger,
		authorize: config.Authorize,
		retry:     config.Retry.defaultValues(),
		dialer:    websocket.DefaultDialer,

		token:   "",
		session: nil,
		state:   stateRunning,
		closed:  make(chan struct{}),
	}

	// if secure connection required
	if cl.proxyAddr[:3] == "wss" {
		tlsConfig := config.TLSConfig
		if tlsConfig == nil {
			return nil, ErrTLSConfigRequired
		}
		cl.dialer = &websocket.Dialer{
			TLSClientConfig: tlsConfig.Clone(),
		}
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
		// Log:              cl.logger,
		StreamBufferSize: 4 * 1024,
	}

	cl.session = wsmux.Client(conn, sessionConfig)
	cl.state = stateRunning
	return cl, nil
}

// Accept returns a new net.Conn from the proxy. Accept will return a
// temporary net.Error if the connection breaks or it is attempting
// reconnection.
func (c *client) Accept() (net.Conn, error) {
	select {
	case <-c.closed:
		return nil, ErrClientClosed
	default:
	}

	c.m.Lock()
	if c.state == stateBroken {
		defer c.m.Unlock()
		// acceptErr must be non nil when state is {stateClosed, stateBroken}
		c.logger.Printf("accept failed with error %v", c.acceptErr)
		return nil, c.acceptErr
	}

	stream, err := c.session.Accept()
	if err != nil {
		c.logger.Printf("accept failed: attempting reconnect")
		// problem with session
		// close session and attempt reconnect
		// set client error to reconnecting
		c.acceptErr = ErrClientReconnecting

		c.logger.Printf("state: broken")

		c.state = stateBroken
		// reconnect after mutex release
		defer c.reconnect()
		// next call to accept cannot enter critical section until reconnect finishes executing
		defer c.m.Unlock()
		return nil, c.acceptErr
	}

	defer c.m.Unlock()
	return stream, nil
}

// Close is used to close the listener.
func (c *client) Close() error {
	select {
	case <-c.closed:
	default:
		close(c.closed)
		// lock and close session when possible
		go func() {
			c.m.Lock()
			if c.session != nil {
				_ = c.session.Close()
			}
		}()
	}
	return nil
}

// Addr returns the local Addr of the listener
func (c *client) Addr() net.Addr {
	c.m.Lock()
	defer c.m.Unlock()
	if c.session != nil {
		return c.session.Addr()
	}
	return nil
}

// connectWithRetry returns a websocket connection to the proxy
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
	c.logger.Printf("trying to connect to %s", c.proxyAddr)
	conn, res, err := c.dialer.Dial(addr, header)
	if err != nil {
		if shouldRetry(res) {
			// retry connection and return result
			return c.retryConn()
		}
		c.logger.Printf("connection failed with error:%v, response:%v", err, res)
		return nil, ErrRetryFailed
	}
	c.logger.Printf("connected to %s ", c.proxyAddr)
	return conn, err
}

// retryConn is a utility function used by connectWithRetry to use exponential
// backoff to attempt reconnection
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
			c.logger.Printf("trying to connect to %s", c.proxyAddr)
			conn, res, err := c.dialer.Dial(addr, header)
			if err == nil {
				return conn, nil
			}
			if !shouldRetry(res) {
				c.logger.Printf("connection to %s failed. could not connect", c.proxyAddr)
				return nil, ErrRetryFailed
			}
			c.logger.Printf("connection to %s failed. will retry", c.proxyAddr)

			currentDelay = c.retry.nextDelay(currentDelay)
			backoff = time.After(currentDelay)
		}
	}

}

// reconnect is used to repair broken connections
func (c *client) reconnect() {
	c.m.Lock()
	defer c.m.Unlock()
	conn, err := c.connectWithRetry()
	if err != nil {
		// set error and return
		c.logger.Printf("unable to reconnect to %s", c.proxyAddr)
		c.acceptErr = ErrRetryFailed
		return
	}

	if c.session != nil {
		_ = c.session.Close()
		c.session = nil
	}

	sessionConfig := wsmux.Config{
		// Log:              c.logger,
		StreamBufferSize: 4 * 1024,
	}
	c.session = wsmux.Client(conn, sessionConfig)
	c.state = stateRunning
	c.logger.Printf("state: running")
	c.acceptErr = nil
}

// simple utility
func shouldRetry(r *http.Response) bool {
	// may be that proxy is down for changing secrets and therefore unreachable
	if r == nil {
		return true
	}
	if r.StatusCode/100 == 4 || r.StatusCode/100 == 2 {
		return false
	}
	return true
}
