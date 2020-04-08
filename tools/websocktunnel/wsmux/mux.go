// wsmux multiplexes multiple bidirectional streams over a single websocket.
//
// It presents an Session API similar to the TCP socket API.
//
// This is a low-level part of websocktunnel; users should instead use the
// github.com/taskcluster/client class.
package wsmux

import (
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/websocktunnel/util"
)

// Config contains configuration for a new session, as created with `Server` or `Client`.
// All of the fields are optional.
type Config struct {
	// KeepAliveInterval is the interval between keepAlives.  The session will send websocket
	// ping frames at this interval. Default: 10 seconds
	KeepAliveInterval time.Duration

	// StreamAcceptDeadline is the time after which opening a new stream will time out.
	// Default: 30 seconds
	StreamAcceptDeadline time.Duration

	// CloseCallback is a callback function which is invoked when the session is closed.
	// This can be updated later with `session.SetCloseCallback(..)`.
	CloseCallback func()

	// Log must implement util.Logger. This defaults to NilLogger.
	Log util.Logger

	// StreamBufferSize sets the maximum buffer size of streams created by the session.
	// Default: 1024 bytes
	StreamBufferSize int
}

// Server instantiates a new server session over a websocket connection.
//
// This function takes ownership of `conn`; nothing else should use the connection.
func Server(conn *websocket.Conn, conf Config) *Session {
	return newSession(conn, true, conf)
}

// Client instantiates a new client session over a websocket connection.
//
// This function takes ownership of `conn`; nothing else should use the connection.
func Client(conn *websocket.Conn, conf Config) *Session {
	return newSession(conn, false, conf)
}
