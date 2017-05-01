package wsmux

import (
	"github.com/gorilla/websocket"
)

// Server (NOTE: set server field to 0 for server connection)
func Server(conn *websocket.Conn, onRemoteClose func(*Session)) *Session {
	return newSession(conn, 0, onRemoteClose)
}

// Client (set server field to 1, yes, it is unintuitive)
func Client(conn *websocket.Conn, onRemoteClose func(*Session)) *Session {
	return newSession(conn, 1, onRemoteClose)
}
