package expose

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"
)

type exposeProxy interface {
	// stop the proxy
	Close() error
}

type httpProxy struct {
	server *http.Server
}

// Start a proxy running on all interfaces on this host, at an arbitrary port,
// forwarding traffic to the given port on localhost.
func proxyHTTP(listener net.Listener, targetPort uint16) (exposeProxy, error) {
	targetURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", targetPort))
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// We want to support streaming responses that are not detected as such (for
	// example, a streaming logfile).  So, arrange to flush any buffered data after
	// 100ms.
	proxy.FlushInterval = 100 * time.Millisecond

	server := &http.Server{
		Handler: websockCompatibleHandlerFunc(proxy, targetPort),
	}

	go func() {
		server.Serve(listener)
	}()

	return &httpProxy{server}, nil
}

func (p *httpProxy) Close() error {
	err := p.server.Close()
	if err != nil {
		return err
	}
	return nil
}

type tcpPortProxy struct {
	server *http.Server
}

func proxyTCPPort(listener net.Listener, targetPort uint16) (exposeProxy, error) {
	server := &http.Server{
		Handler: websocketToTCPHandlerFunc(targetPort),
	}

	go func() {
		server.Serve(listener)
	}()

	return &tcpPortProxy{server}, nil
}

func (p *tcpPortProxy) Close() error {
	err := p.server.Close()
	if err != nil {
		return err
	}
	return nil
}
