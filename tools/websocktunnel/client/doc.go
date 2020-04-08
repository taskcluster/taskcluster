// Package client wraps a wsmux client session in a net.Listener interface.
// It attempts to reconnect to the proxy in case of a connection failure.
// It can be configured by setting the appropriate parameters in the Config object
// passed to client.New().
package client
