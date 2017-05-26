package client

import (
	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/wsmux"
	"net/http"
)

type Client struct {
	Id string
	// handler should be a mux to handle different end points
	Handler http.Handler
	Config  wsmux.Config
}

// ServeOnProxy serves endpoints registered on handler on the proxy
func (c *Client) ServeOnProxy(proxyAddr string) error {
	header := make(http.Header)
	header.Set("x-worker-id", c.Id)
	conn, _, err := websocket.DefaultDialer.Dial(proxyAddr, header)
	if err != nil {
		return err
	}
	client := wsmux.Client(conn, c.Config)
	server := &http.Server{Handler: c.Handler}
	return server.Serve(client)
}
