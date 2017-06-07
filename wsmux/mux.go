package wsmux

import (
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
)

// Config contains run time parameters for Session
type Config struct {
	// KeepAliveInterval is the interval between keepAlives.
	// Default: 10 seconds
	KeepAliveInterval time.Duration

	// StreamAcceptDeadline is the time after which a stream will time out and not be accepted.
	// Default: 30 seconds
	StreamAcceptDeadline time.Duration

	// CloseCallback is a callback function which is invoked when the session is closed.
	CloseCallback func()

	// Log must implement util.Logger. This defaults to NilLogger.
	Log util.Logger

	// StreamBufferSize sets the maximum buffer size of streams created by the session.
	// Default: 1024 bytes
	StreamBufferSize int
}

// Server instantiates a new server session over a websocket connection. There can only be one Server session over
// a websocket connection.
func Server(conn *websocket.Conn, conf Config) *Session {
	return newSession(conn, true, conf)
}

// Client instantiates a new client session over a websocket connection. There must only be one
// client session over a websocket connection.
func Client(conn *websocket.Conn, conf Config) *Session {
	return newSession(conn, false, conf)
}
