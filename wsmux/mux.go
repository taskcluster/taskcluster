package wsmux

import (
	"time"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/util"
)

// Config values for Session
type Config struct {
	KeepAliveInterval    time.Duration // default 10 seconds
	StreamAcceptDeadline time.Duration // default 30 seconds
	RemoteCloseCallback  func()        // called when session is closed
	Log                  util.Logger   // writes loggin messages. default is nilLogger
	StreamBufferSize     int           // default 1024 bytes
}

// Server (NOTE: set server field to 0 for server connection)
func Server(conn *websocket.Conn, conf Config) *Session {
	return newSession(conn, true, conf)
}

// Client (set server field to 1, yes, it is unintuitive)
func Client(conn *websocket.Conn, conf Config) *Session {
	return newSession(conn, false, conf)
}
