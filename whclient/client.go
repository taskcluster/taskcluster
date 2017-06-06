package whclient

import (
	"math/rand"
	"net"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

// Client is used to connect to a proxy and serve endpoints
// defined in Handler
type Client struct {
	ID string
	// handler should be a mux to handle different end points
	Config    wsmux.Config
	ProxyAddr string // Address of proxy server for connection
	Retry     RetryConfig
	JWT       string // JWT for proxy auth
}

const (
	defaultInitialDelay        = 500 * time.Millisecond
	defaultMaxDelay            = 60 * time.Second
	defaultMaxElapsedTime      = 3 * time.Minute
	defaultMultiplier          = 1.5
	defaultRandomizationFactor = 0.5
)

// RetryConfig contains exponential backoff parameters for retrying connections
type RetryConfig struct {
	// Retry values
	InitialDelay        time.Duration // Default = 500 * time.Millisecond
	MaxDelay            time.Duration // Default = 60 * time.Second
	MaxElapsedTime      time.Duration // Default = 3 * time.Minute
	Multiplier          float64       // Default = 1.5
	RandomizationFactor float64       // Default = 0.5
}

// NextDelay calculates the next interval based on the current interval
func (r RetryConfig) NextDelay(currentDelay time.Duration) time.Duration {
	// check if current interval is max interval
	// avoid calculation
	if currentDelay == r.MaxDelay {
		return currentDelay
	}

	delta := r.RandomizationFactor * float64(currentDelay)
	minDelay := float64(currentDelay) - delta
	maxDelay := float64(currentDelay) + delta
	nextDelay := minDelay + (rand.Float64() * (maxDelay - minDelay + 1))
	Delay := time.Duration(nextDelay)
	if Delay > r.MaxDelay {
		Delay = r.MaxDelay
	}
	return Delay
}

// GetListener connects to the proxy and returns a net.Listener instance
// The session can be used as a listener to serve HTTP requests
// eg http.Serve(client)
func (c *Client) GetListener(retry bool) (net.Listener, error) {
	addr := strings.TrimSuffix(c.ProxyAddr, "/") + "/register/" + c.ID

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

	client := wsmux.Client(conn, c.Config)
	return client, nil
}

// reconnect attempts to establish a connection to the server
// using an exponential backoff algorithm
// do not retry if response status code is 4xx
func (c *Client) reconnect() (*websocket.Conn, error) {
	addr := strings.TrimSuffix(c.ProxyAddr, "/") + "/register/" + c.ID

	c.initializeRetryValues()

	// planned on supporting MaxElapsedTime == 0, but no apparent use case.
	// please advise
	maxTimer := time.After(c.Retry.MaxElapsedTime)

	currentDelay := c.Retry.InitialDelay
	backoffTimer := time.NewTimer(currentDelay)

	for {
		select {
		case <-maxTimer:
			return nil, ErrRetryTimedOut
		case <-backoffTimer.C:
			conn, res, err := websocket.DefaultDialer.Dial(addr, nil)
			if res.StatusCode/100 == 4 {
				return nil, err
			}
			if err == nil {
				return conn, err
			}
			// increment backoff
			currentDelay = c.Retry.NextDelay(currentDelay)
			_ = backoffTimer.Reset(currentDelay)
		}
	}
}

// initializeRetryValues sets the RetryConfig parameteres to their
// default value
func (c *Client) initializeRetryValues() {
	if c.Retry.InitialDelay == 0 {
		c.Retry.InitialDelay = defaultInitialDelay
	}
	if c.Retry.MaxDelay == 0 {
		c.Retry.MaxDelay = defaultMaxDelay
	}
	if c.Retry.MaxElapsedTime == 0 {
		c.Retry.MaxElapsedTime = defaultMaxElapsedTime
	}

	if c.Retry.Multiplier < 1.0 {
		c.Retry.Multiplier = defaultMultiplier
	}

	if c.Retry.RandomizationFactor == 0 {
		c.Retry.RandomizationFactor = defaultRandomizationFactor
	}
}
