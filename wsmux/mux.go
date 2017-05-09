package wsmux

import (
	"github.com/gorilla/websocket"
	"time"
)

// Config values for Session
type Config struct {
	RemoteCloseCallback func()
	AcceptDeadline      time.Time
	ReadDeadline        time.Time
	WriteDeadline       time.Time
	Log                 Logger
}

// Server (NOTE: set server field to 0 for server connection)
func Server(conn *websocket.Conn, conf Config) *Session {
	return newSession(conn, true, conf)
}

// Client (set server field to 1, yes, it is unintuitive)
func Client(conn *websocket.Conn, conf Config) *Session {
	return newSession(conn, false, conf)
}
