package expose

import (
	"fmt"
	"net"

	"net/url"
)

type localExposer struct {
	publicIP net.IP
}

// Create a local exposer implementation.  Local exposers are useful for local
// testing, and simply exposes the URL as given, or (for ExposeTCPPort) proxies
// a websocket on localhost to the port.
func NewLocal(publicIP net.IP) (Exposer, error) {
	return &localExposer{publicIP}, nil
}

func (exposer *localExposer) ExposeHTTP(targetPort uint16) (Exposure, error) {
	exposure := &localHTTPExposure{exposer: exposer, targetPort: targetPort}
	err := exposure.start()
	if err != nil {
		return nil, err
	}
	return exposure, nil
}

func (exposer *localExposer) ExposeTCPPort(targetPort uint16) (Exposure, error) {
	exposure := &localPortExposure{exposer: exposer, targetPort: targetPort}
	err := exposure.start()
	if err != nil {
		return nil, err
	}
	return exposure, nil
}

// getURL is a utility function for local exposures
func (exposer *localExposer) getURL(listener net.Listener, scheme string) *url.URL {
	_, portStr, _ := net.SplitHostPort(listener.Addr().String())

	return &url.URL{
		Scheme: scheme,
		Host:   fmt.Sprintf("%s:%s", exposer.publicIP, portStr),
	}
}

type localHTTPExposure struct {
	exposer    *localExposer
	targetPort uint16
	listener   net.Listener
	proxy      exposeProxy
}

func (exposure *localHTTPExposure) start() error {
	// allocate a port dynamically by specifying :0
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return err
	}
	exposure.listener = listener

	proxy, err := proxyHTTP(listener, exposure.targetPort)
	if err != nil {
		listener.Close()
		return err
	}

	exposure.proxy = proxy
	return nil
}

func (exposure *localHTTPExposure) Close() error {
	if exposure.proxy != nil {
		if err := exposure.proxy.Close(); err != nil {
			return err
		}
	}
	exposure.proxy = nil
	return nil
}

func (exposure *localHTTPExposure) GetURL() *url.URL {
	return exposure.exposer.getURL(exposure.listener, "http")
}

type localPortExposure struct {
	exposer    *localExposer
	targetPort uint16
	listener   net.Listener
	proxy      exposeProxy
}

func (exposure *localPortExposure) start() error {
	// allocate a port dynamically by specifying :0
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return err
	}
	exposure.listener = listener

	proxy, err := proxyTCPPort(listener, exposure.targetPort)
	if err != nil {
		listener.Close()
		return err
	}

	exposure.proxy = proxy
	return nil
}

func (exposure *localPortExposure) Close() error {
	if exposure.proxy != nil {
		if err := exposure.proxy.Close(); err != nil {
			return err
		}
	}
	exposure.proxy = nil
	return nil
}

func (exposure *localPortExposure) GetURL() *url.URL {
	return exposure.exposer.getURL(exposure.listener, "ws")
}
