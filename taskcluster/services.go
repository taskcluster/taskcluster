package taskcluster

import (
	"fmt"
	url "net/url"
	"regexp"
	"strings"
)

// Services can convert urls to proxied urls
type Services struct {
	Domain string
}

// NewServices create a Service with default domain
func NewServices() Services {
	return Services{Domain: "taskcluster.net"}
}

var hostnamePattern = regexp.MustCompile(`^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$`)

// ConvertPath converts a url for the proxy server into a url for the proper taskcluster
// service.
//
// Examples:
//
// "/queue/v1/stuff" -> "http://queue.taskcluster.net/v1/stuff"
//
func (s *Services) ConvertPath(u *url.URL) (*url.URL, error) {
	// Find raw path, removing the initial slash if present
	// afaik initial slash should always be there.
	rawPath := u.EscapedPath()
	if len(rawPath) > 0 && rawPath[0] == '/' {
		rawPath = rawPath[1:]
	}

	// First part of the path is the service name.
	i := strings.IndexByte(rawPath, '/')
	if i == -1 {
		i = len(rawPath)
	}
	service := rawPath[:i]
	path := rawPath[i:]

	// Remove slash from start of path
	if len(path) > 0 && path[0] == '/' {
		path = path[1:]
	}

	// If service not a valid hostname return error
	if !hostnamePattern.MatchString(service) {
		return u, fmt.Errorf("%s is not a valid taskcluster service", service)
	}

	var serviceEndpoint string
	// If service name doesn't contain a dot, we assume it's a shortcut
	// like: auth, queue, ... and suffix with self.Domain
	if !strings.Contains(service, ".") {
		// This is pretty much legacy
		serviceEndpoint = "https://" + service + "." + s.Domain
	} else {
		// Otherwise we assume service is the hostname
		serviceEndpoint = "https://" + service
	}

	// Attempt to construct a new endpoint
	query := u.RawQuery
	if query != "" {
		query = "?" + query
	}
	realEndpoint, err := url.Parse(serviceEndpoint + "/" + path + query)

	if err != nil {
		return u, err
	}

	return realEndpoint, nil
}
