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

// TokenGenerator is a function which accepts a string `id` and returns a
// signed JWT (JSON Web Token). If an error occurs, the
// return values must be ("", ErrorGenerated).
type TokenGenerator func(id string) (string, error)

// TestTokenGenerator is the default TokenGenerator. It creates a new JWT and sets
// claim "tid" to the given id (proxy convention). "nbf" is set to 5 minutes before the
// creation of the JWT and "exp" is set to 30 days after creation of JWT. The jwt is
// signed using HS256 with the secret "test-secret".
func TestTokenGenerator(id string) (string, error) {
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
		return "", err
	}
	return tokString, nil
}

// Config is used for creating a new client.
type Config struct {
	// ID is the worker-id of the client. This field must match the "tid" claim of the
	// JWT.
	ID string

	// ProxyAddr is the websocket address of the proxy to which the client should connect.
	ProxyAddr string

	// SessionLogger is an optional field. This logger is passed to the session created by
	// the GetListener method. This defaults to `&util.NilLogger{}`.
	SessionLogger util.Logger

	// Token is the signed JWT used for authentication.
	Token string

	// Tokenator is the TokenGenerator used by the client to generate a new JWT when needed.
	// The client may sign it's own JWT or request one from an external source. This defaults
	// to TestTokenGenerator.
	Tokenator TokenGenerator

	// Retry contains the retry parameters to use in case of reconnects.
	// The default values are specified in RetryConfig.
	Retry RetryConfig
}

// Client is used to connect to a Webhook Proxy instance and create a listener for
// serving API endpoints.
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
	// jwt used for authentication
	token string
	// jwt expiry time
	expires time.Time
	// configurer used for loading jwt if not available or expired
	tokenator TokenGenerator
}

// New creates a new Client instance
func New(conf Config) *Client {
	client := &Client{
		id:            conf.ID,
		proxyAddr:     conf.ProxyAddr,
		sessionLogger: conf.SessionLogger,
		token:         conf.Token,
		expires:       util.GetTokenExp(conf.Token),
		tokenator:     conf.Tokenator,
	}

	client.retry = conf.Retry.defaultValues()

	if client.sessionLogger == nil {
		client.sessionLogger = &util.NilLogger{}
	}
	if client.tokenator == nil {
		client.tokenator = TestTokenGenerator
	}

	return client
}

// GetListener connects to the proxy and returns a net.Listener instance
// by connecting to the proxy and setting up a wsmux Session.
func (c *Client) GetListener(retry bool) (net.Listener, error) {
	addr := strings.TrimSuffix(c.proxyAddr, "/") + "/register/" + c.id

	if !c.tokenUsable() {
		token, err := c.tokenator(c.id)
		c.token, c.expires = token, util.GetTokenExp(token)
		if err != nil {
			return nil, err
		}
	}

	c.sessionLogger.Printf("token: %s, exp: %v", c.token, c.expires)
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

	config := wsmux.Config{Log: c.sessionLogger, StreamBufferSize: 4 * 1024}
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
	if c.retry.InitialDelay == 0 {
		panic("")
	}
	backoff := time.NewTimer(currentDelay)

	// create header for connection requests
	header := make(http.Header)
	header.Set("Authorization ", "Bearer "+c.token)

	for {
		select {
		case <-maxTimer:
			return nil, ErrRetryTimedOut
		case <-backoff.C:
			conn, res, err := websocket.DefaultDialer.Dial(addr, header)

			if res.StatusCode/100 == 4 {
				return nil, err
			}
			if err == nil {
				return conn, err
			}
			// increment backoff
			currentDelay = c.retry.NextDelay(currentDelay)
			_ = backoff.Reset(currentDelay)
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
