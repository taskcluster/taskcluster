package expose

import (
	"crypto/tls"
	"fmt"
	"net"
	"time"

	"net/url"

	"github.com/taskcluster/stateless-dns-go/hostname"
)

type statelessDNSExposer struct {
	publicIP           net.IP
	hostDomain         string
	statelessDNSSecret string
	duration           time.Duration
	tlsCert            string
	tlsKey             string
}

// Create a stateless DNS exposer implementation.  This is similar to a local
// exposer, except that it generates hostnames compatible with
// https://github.com/taskcluster/stateless-dns-go and can thus use TLS
// certificates to serve over https.  The hostname is formed by prepending
// a string indicating the IP and expiration to the hostDomain.  That string
// is signed with the statelessDNSSecret in such a way that the DNS server can
// validate it.  The tlsCert and tlsKey are used to serve HTTPS, and should
// be valid for `*.<hostDomain>`.
func NewStatelessDNS(publicIP net.IP, hostDomain, statelessDNSSecret string, duration time.Duration, tlsCert, tlsKey string) (Exposer, error) {
	return &statelessDNSExposer{publicIP, hostDomain, statelessDNSSecret, duration, tlsCert, tlsKey}, nil
}

func (exposer *statelessDNSExposer) ExposeHTTP(targetPort uint16) (Exposure, error) {
	exposure := &statelessDNSHTTPExposure{exposer: exposer, targetPort: targetPort}
	err := exposure.start()
	if err != nil {
		return nil, err
	}
	return exposure, nil
}

func (exposer *statelessDNSExposer) ExposeTCPPort(targetPort uint16) (Exposure, error) {
	exposure := &statelessDNSPortExposure{exposer: exposer, targetPort: targetPort}
	err := exposure.start()
	if err != nil {
		return nil, err
	}
	return exposure, nil
}

// makeListener is a utility for exposures to generate a listener with
// the appropriate TLS configuration
func (exposer *statelessDNSExposer) makeListener() (net.Listener, error) {
	cert, err := tls.X509KeyPair([]byte(exposer.tlsCert), []byte(exposer.tlsKey))
	if err != nil {
		return nil, err
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
	}
	// :0 means to choose an arbitrary port
	return tls.Listen("tcp", ":0", tlsConfig)
}

// getURL is a utility function for exposures to generate a URL
// using the stateless DNS hostname
func (exposer *statelessDNSExposer) getURL(listener net.Listener, scheme string) *url.URL {
	_, portStr, _ := net.SplitHostPort(listener.Addr().String())

	deadline := time.Now().Add(exposer.duration)
	statelessHostname := hostname.New(exposer.publicIP, exposer.hostDomain, deadline, exposer.statelessDNSSecret)

	return &url.URL{
		Scheme: scheme,
		Host:   fmt.Sprintf("%s:%s", statelessHostname, portStr),
	}
}

// close is a utility for exposures
func (exposer *statelessDNSExposer) close(listener net.Listener, proxy exposeProxy) error {
	if proxy != nil {
		if err := proxy.Close(); err != nil {
			return err
		}
	}
	if listener != nil {
		if err := listener.Close(); err != nil {
			return err
		}
	}
	return nil
}

// statelessDNSHTTPExposure exposes an HTTP server
type statelessDNSHTTPExposure struct {
	exposer    *statelessDNSExposer
	targetPort uint16
	listener   net.Listener
	proxy      exposeProxy
}

func (exposure *statelessDNSHTTPExposure) start() error {
	listener, err := exposure.exposer.makeListener()
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

func (exposure *statelessDNSHTTPExposure) Close() error {
	return exposure.exposer.close(exposure.listener, exposure.proxy)
}

func (exposure *statelessDNSHTTPExposure) GetURL() *url.URL {
	return exposure.exposer.getURL(exposure.listener, "https")
}

// statelessDNSPortExposure exposes a port, via a websocket server
type statelessDNSPortExposure struct {
	exposer    *statelessDNSExposer
	targetPort uint16
	listener   net.Listener
	proxy      exposeProxy
}

func (exposure *statelessDNSPortExposure) start() error {
	listener, err := exposure.exposer.makeListener()
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

func (exposure *statelessDNSPortExposure) Close() error {
	return exposure.exposer.close(exposure.listener, exposure.proxy)
}

func (exposure *statelessDNSPortExposure) GetURL() *url.URL {
	return exposure.exposer.getURL(exposure.listener, "wss")
}
