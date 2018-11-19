package taskcluster

import (
	"fmt"
	url "net/url"
	"regexp"
	"strings"

	tcUrls "github.com/taskcluster/taskcluster-lib-urls"
)

// Services can convert urls to proxied urls
type Services struct {
	RootURL string
}

// NewServices create a Service with default domain
func NewServices(rootURL string) Services {
	return Services{RootURL: rootURL}
}

var hostnamePattern = regexp.MustCompile(`^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$`)

// ConvertPath converts a url for the proxy server into a url for the proper taskcluster
// service on the given rootURL
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

	query := u.RawQuery
	if query != "" {
		query = "?" + query
	}

	var realEndpoint *url.URL
	var err error
	// If service name doesn't contain a dot, we assume it's a shortcut
	// like: auth, queue, ... and qualify it with self.RootURL
	if !strings.Contains(service, ".") {
		// extract version and path
		i = strings.IndexByte(path, '/')
		if i == -1 {
			i = len(path)
		}
		realEndpoint, err = url.Parse(tcUrls.API(s.RootURL, service, path[:i], path[i+1:]+query))
		if err != nil {
			return u, err
		}
	} else {
		// Otherwise we assume service is the hostname
		serviceEndpoint := "https://" + service

		// Attempt to construct a new endpoint
		realEndpoint, err = url.Parse(serviceEndpoint + "/" + path + query)

		if err != nil {
			return u, err
		}
	}

	return realEndpoint, nil
}
