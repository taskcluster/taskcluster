package whclient

import (
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/dgrijalva/jwt-go"
	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

// TokenGenerator can be used to generate new jwts for a given ID
type TokenGenerator func(id string) (string, time.Time, error)

func TestTokenGenerator(id string) (string, time.Time, error) {
	now := time.Now()
	expires := now.Add(30 * 24 * time.Hour)

	token := jwt.New(jwt.SigningMethodHS256)

	token.Claims.(jwt.MapClaims)["iat"] = now.Unix()
	token.Claims.(jwt.MapClaims)["nbf"] = now.Unix() - 300 // 5 minutes
	token.Claims.(jwt.MapClaims)["iss"] = "taskcluster-auth"
	token.Claims.(jwt.MapClaims)["exp"] = expires.Unix()
	token.Claims.(jwt.MapClaims)["tid"] = id

	tokString, err := token.SignedString([]byte("test-secret"))
	if err != nil {
		return "", time.Time{}, err
	}
	return tokString, expires, nil
}

type Config struct {
	ID               string
	ProxyAddr        string
	SessionLogger    util.Logger
	StreamBufferSize int
	Token            string
	Expires          time.Time
	Tokenator        TokenGenerator
	Retry            RetryConfig
}

// Client is used to connect to a proxy and serve endpoints
// defined in Handler
type Client struct {
	// id is the worker ID in the jwt
	id string
	// proxyAddr contains the address of the proxy server
	proxyAddr string
	// retry consists of parameters for reconneting to the proxy in case of a broken
	// connection
	retry RetryConfig
	// session logger can be used to log the created session
	sessionLogger util.Logger
	// bufSize sets the stream buffer size for the session
	bufSize int
	// jwt used for authentication
	token string
	// jwt expiry time
	expires time.Time
	// configurer used for loading jwt if not available or expired
	tokenator TokenGenerator
}

// New creates a new client instance
func New(conf Config) (*Client, error) {
	client := &Client{
		id:            conf.ID,
		proxyAddr:     conf.ProxyAddr,
		sessionLogger: conf.SessionLogger,
		bufSize:       conf.StreamBufferSize,
		token:         conf.Token,
		expires:       conf.Expires,
		tokenator:     conf.Tokenator,
		retry:         conf.Retry,
	}

	client.retry = client.retry.initializeRetryValues()
	if client.sessionLogger == nil {
		client.sessionLogger = &util.NilLogger{}
	}
	if client.bufSize == 0 {
		client.bufSize = 4 * 1024 // Default 4k buffer
	}
	if client.tokenator == nil {
		client.tokenator = TestTokenGenerator
	}
	return client, nil
}

// GetListener connects to the proxy and returns a net.Listener instance
// The session can be used as a listener to serve HTTP requests
// eg http.Serve(client)
func (c *Client) GetListener(retry bool) (net.Listener, error) {
	addr := strings.TrimSuffix(c.proxyAddr, "/") + "/register/" + c.id

	if !c.tokenUsable() {
		token, expires, err := c.tokenator(c.id)
		c.token, c.expires = token, expires
		if err != nil {
			return nil, err
		}
	}

	header := make(http.Header)
	header.Set("Authorization ", "Bearer "+c.token)

	conn, res, err := websocket.DefaultDialer.Dial(addr, nil)
	if res.StatusCode/100 == 4 {
		return nil, err
	}
	if err != nil && retry {
		conn, err = c.reconnect()
		if err != nil {
			return nil, err
		}
	}

	config := wsmux.Config{Log: c.sessionLogger, StreamBufferSize: c.bufSize}
	client := wsmux.Client(conn, config)
	return client, nil
}

// reconnect attempts to establish a connection to the server
// using an exponential backoff algorithm
// do not retry if response status code is 4xx
func (c *Client) reconnect() (*websocket.Conn, error) {
	addr := strings.TrimSuffix(c.proxyAddr, "/") + "/register/" + c.id

	// planned on supporting MaxElapsedTime == 0, but no apparent use case.
	// please advise
	maxTimer := time.After(c.retry.MaxElapsedTime)

	currentDelay := c.retry.InitialDelay
	backoffTimer := time.NewTimer(currentDelay)

	for {
		select {
		case <-maxTimer:
			return nil, ErrRetryTimedOut
		case <-backoffTimer.C:
			header := make(http.Header)
			header.Set("Authorization ", "Bearer "+c.token)

			conn, res, err := websocket.DefaultDialer.Dial(addr, header)

			if res.StatusCode/100 == 4 {
				return nil, err
			}
			if err == nil {
				return conn, err
			}
			// increment backoff
			currentDelay = c.retry.NextDelay(currentDelay)
			_ = backoffTimer.Reset(currentDelay)
		}
	}
}

// Check if token is empty or expired
func (c *Client) tokenUsable() bool {
	if c.token == "" {
		return false
	}

	now := time.Now().Unix()
	if now > c.expires.Unix() {
		return false
	}

	return true
}
