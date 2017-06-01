package client

import (
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/wsmux"
)

// Client is used to connect to a proxy and serve endpoints
// defined in Handler
type Client struct {
	Id string
	// handler should be a mux to handle different end points
	Handler http.Handler
	Config  wsmux.Config
}

// ServeOnProxy serves endpoints registered on handler on the proxy
func (c *Client) ServeOnProxy(proxyAddr string) error {
	addr := strings.TrimSuffix(proxyAddr, "/") + "/register/" + c.Id + "/"

	conn, _, err := websocket.DefaultDialer.Dial(addr, nil)
	if err != nil {
		return err
	}

	client := wsmux.Client(conn, c.Config)
	server := &http.Server{Handler: c.Handler}
	return server.Serve(client)
}
