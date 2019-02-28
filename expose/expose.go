// Expose serves as an abstract mechanism for exposing local services to the world.
//
// It supports both HTTP services (to which it can proxy directly) and
// plain-old TCP ports, which it exposes via websockets.
//
// Exposing starts by creating an Exposer, which can be one of several types depending
// on available resorces.  That Exposer is then used to create Exposures for specific
// backend services.  Each Exposure then provides a GetURL method that returns a
// public URL which will reach the exposed service.
package expose

import "net/url"

// Exposer provides an interface for exposing services, including configuration
// and any necessary shared state.  It is intended to exist for the lifetime of
// the process.
type Exposer interface {
	// Expose an HTTP service.  The resulting URL will proxy directly to this
	// service, including streaming bidirectional communication
	ExposeHTTP(targetPort uint16) (Exposure, error)

	// Expose a TCP port.  The resulting URL will proxy websocket connections
	// to the given port.  For each new websocket connection, a new TCP
	// connection is initiated to the backend service.  The payload of each
	// incoming websocket message is written to the TCP connection, and all
	// data read from the TCP connection is written to the websocket.
	//
	// Note that TCP is not a message-framed protocol, so callers should not
	// rely on message boundaries to delimit data transmitted across this
	// connection.
	ExposeTCPPort(targetPort uint16) (Exposure, error)
}

// Exposure is a more ephemeral exposure of a single backend service, derived
// from Exposer.ExposeHTTP or Exposer.ExposeTCPPort.  It can return a URL
// for the exposed service, and can be Closed when the service should no
// longer be exposed.
type Exposure interface {
	// Stop this exposure.  Note that any existing connections may continue
	// to operate.
	Close() error

	// Get the public URL for this exposure
	GetURL() *url.URL
}
