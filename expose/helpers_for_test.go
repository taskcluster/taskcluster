package expose

import (
	"net"
	"strconv"
)

func listenOnRandomPort() (net.Listener, uint16, error) {
	// allocate a port dynamically by specifying :0
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return nil, 0, err
	}

	// retrive the selected port from the listener
	_, portStr, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		return nil, 0, err
	}

	port, err := strconv.Atoi(portStr)
	if err != nil {
		return nil, 0, err
	}

	return listener, uint16(port), nil
}
