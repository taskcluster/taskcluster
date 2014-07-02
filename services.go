package taskcluster

import (
	"fmt"
	url "net/url"
	s "strings"
)

type Services struct {
	Endpoints map[string]string
}

func NewServices() Services {
	// Hardcoded list of services provided by taskcluster.
	endpoints := map[string]string{
		// Each service endpoint must end in a '/'.
		"queue":     "http://queue.taskcluster.net/",
		"scheduler": "http://scheduler.taskcluster.net/",
		"auth":      "http://auth.taskcluster.net/",
	}

	return Services{Endpoints: endpoints}
}

// Convert a url for the proxy server into a url for the proper taskcluster
// service.
//
// Examples:
//
// "/queue/v1/stuff" -> "http://queue.taskcluster.net/v1/stuff"
//
func (self *Services) ConvertPath(url *url.URL) (*url.URL, error) {
	// First part of the path is the service name.
	pathParts := s.Split(url.Path[1:], "/")
	service := pathParts[0]
	serviceEndpoint, endpointExists := self.Endpoints[service]

	// If an invalid endpoint was passed return an error.
	if !endpointExists {
		return url, fmt.Errorf("%s is not a valid taskcluster service", service)
	}

	// Attempt to construct a new endpoint
	realEndpoint, err := url.Parse(serviceEndpoint + s.Join(pathParts[1:], "/"))

	if err != nil {
		return url, err
	}

	return realEndpoint, nil
}
