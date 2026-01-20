package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"maps"

	"github.com/taskcluster/httpbackoff/v3"
	tcUrls "github.com/taskcluster/taskcluster-lib-urls"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	tc "github.com/taskcluster/taskcluster/v96/tools/taskcluster-proxy/taskcluster"
)

// Routes represents the context of the running service
type Routes struct {
	tcclient.Client
	services tc.Services
	lock     sync.RWMutex
}

// CredentialsUpdate is the internal representation of the json body which is
// used to update the internal client credentials
type CredentialsUpdate struct {
	ClientID    string `json:"clientId"`
	AccessToken string `json:"accessToken"`
	Certificate string `json:"certificate"`
}

var httpClient = &http.Client{
	// do not follow redirects, and instead pass them back to the caller
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

// NewRoutes creates a new Routes instance.
func NewRoutes(client tcclient.Client) Routes {
	return Routes{
		Client:   client,
		services: tc.NewServices(client.RootURL),
	}
}

func (routes *Routes) setHeaders(res http.ResponseWriter) {
	headersToSend := res.Header()
	headersToSend.Set("X-Taskcluster-Proxy-Version", version)
	headersToSend.Set("X-Taskcluster-Proxy-Revision", revision)
	routes.lock.RLock()
	defer routes.lock.RUnlock()
	cert, err := routes.Credentials.Cert()
	if err != nil {
		res.WriteHeader(500)
		// Note, self.Credentials does not expose secrets when rendered as a string
		fmt.Fprintf(res, "Taskcluster Proxy has invalid certificate: %v\n%s", routes.Credentials, err)
		return
	}
	if cert == nil {
		headersToSend.Set("X-Taskcluster-Proxy-Perm-ClientId", routes.Credentials.ClientID)
	} else {
		headersToSend.Set("X-Taskcluster-Proxy-Temp-ClientId", routes.Credentials.ClientID)
		jsonTempScopes, err := json.Marshal(cert.Scopes)
		if err == nil {
			headersToSend.Set("X-Taskcluster-Proxy-Temp-Scopes", string(jsonTempScopes))
		}
	}
	if authScopes := routes.Credentials.AuthorizedScopes; authScopes != nil {
		jsonAuthScopes, err := json.Marshal(authScopes)
		if err == nil {
			headersToSend.Set("X-Taskcluster-Authorized-Scopes", string(jsonAuthScopes))
		}
	}
}

// Implement the Handler interface, dispatching requests to the various
// *Handler methods.  Note that we cannot use ServeMux for this as it mangles
// URLs and sends redircts.
func (routes *Routes) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	url := r.URL.String()
	if strings.HasPrefix(url, "/bewit") {
		routes.BewitHandler(w, r)
	} else if strings.HasPrefix(url, "/credentials") {
		routes.CredentialsHandler(w, r)
	} else if strings.HasPrefix(url, "/api") {
		routes.APIHandler(w, r)
	} else {
		routes.RootHandler(w, r)
	}
}

// BewitHandler is the http handler that provides Hawk signed urls (bewits)
func (routes *Routes) BewitHandler(res http.ResponseWriter, req *http.Request) {
	// Using ReadAll could be sketchy here since we are reading unbounded data
	// into memory...
	routes.setHeaders(res)
	body, err := io.ReadAll(req.Body)

	if err != nil {
		res.WriteHeader(500)
		fmt.Fprintf(res, "Error reading body: %s", err)
		return
	}

	urlString := strings.TrimSpace(string(body))

	urlObject, err := url.Parse(urlString)
	if err != nil {
		res.WriteHeader(500)
		fmt.Fprintf(res, "Error creating bewit url: %s", err)
		return
	}

	bewitURL, err := routes.SignedURL(urlString, urlObject.Query(), time.Hour*1)

	if err != nil {
		res.WriteHeader(500)
		fmt.Fprintf(res, "Error creating bewit url: %s", err)
		return
	}

	headers := res.Header()
	headers.Set("Location", bewitURL.String())
	res.WriteHeader(303)
	fmt.Fprint(res, bewitURL)
}

// CredentialsHandler is the HTTP Handler for serving the /credentials endpoint
func (routes *Routes) CredentialsHandler(res http.ResponseWriter, req *http.Request) {
	routes.setHeaders(res)
	if req.Method != "PUT" {
		log.Printf("Invalid method %s\n", req.Method)
		res.WriteHeader(405)
		return
	}

	decoder := json.NewDecoder(req.Body)

	credentials := &CredentialsUpdate{}
	err := decoder.Decode(credentials)

	if err != nil {
		log.Printf("Could not decode request: %v\n", err)
		res.WriteHeader(400)
		return
	}

	routes.lock.Lock()
	defer routes.lock.Unlock()
	routes.Credentials.ClientID = credentials.ClientID
	routes.Credentials.AccessToken = credentials.AccessToken
	routes.Credentials.Certificate = credentials.Certificate

	res.WriteHeader(200)
}

// RootHandler is the HTTP Handler for / endpoint
func (routes *Routes) RootHandler(res http.ResponseWriter, req *http.Request) {
	routes.setHeaders(res)
	routes.lock.RLock()
	defer routes.lock.RUnlock()

	targetPath, err := routes.services.ConvertPath(req.URL)

	// Unkown service which we are trying to hit...
	if err != nil {
		res.WriteHeader(404)
		log.Printf("Attempting to use unknown service %s", req.URL.String())
		fmt.Fprintf(res, "Unkown taskcluster service: %s", err)
		return
	}
	routes.commonHandler(res, req, targetPath)
}

var apiPath = regexp.MustCompile("^/api/(?P<service>[^/]*)/(?P<apiVersion>[^/]*)/(?P<path>.*)$")

// APIHandler is the HTTP Handler for /api endpoint
func (routes *Routes) APIHandler(res http.ResponseWriter, req *http.Request) {
	routes.setHeaders(res)
	routes.lock.RLock()
	defer routes.lock.RUnlock()

	rawPath := req.URL.EscapedPath()

	query := req.URL.RawQuery
	if query != "" {
		query = "?" + query
	}

	var targetPath *url.URL
	var err error
	match := apiPath.FindStringSubmatch(rawPath)
	if match != nil {
		// reconstruct the target path from the matched parameters (service,
		// apiVersion, path, query) based on the configured RootURL.
		targetPath, err = url.Parse(tcUrls.API(routes.RootURL, match[1], match[2], match[3]+query))
	} else {
		err = fmt.Errorf("invalid /api path")
	}

	if err != nil {
		res.WriteHeader(404)
		log.Printf("%s parsing %s", err, req.URL.String())
		fmt.Fprintf(res, "%s", err)
		return
	}

	routes.commonHandler(res, req, targetPath)
}

// Common code for RootHandler and APIHandler
func (routes *Routes) commonHandler(res http.ResponseWriter, req *http.Request, targetPath *url.URL) {
	res.Header().Set("X-Taskcluster-Endpoint", targetPath.String())
	log.Printf("Proxying %s | %s | %s", req.URL, req.Method, targetPath)

	// In theory, req.Body should never be nil when running as a server, but
	// during testing, with a direct call to the method rather than a real http
	// request coming in from outside, it could be. For example see:
	// https://github.com/taskcluster/taskcluster-proxy/blob/6744fb1d3eaa791394fe651ff3a3f99f606828d5/authorization_test.go#L111
	// Furthermore, it is correct to create an http (client) request with a nil
	// body. See https://golang.org/pkg/net/http/#Request.
	//
	// Technically a client request should not be passed to a server method,
	// but in reality there are not separate types (e.g. HttpClientRequest,
	// HttpServerRequest) and so it can easily happen and is usually done.  For
	// this reason, and to avoid confusion around this, let's keep the nil
	// check in here.
	body := []byte{}
	var err error
	if req.Body != nil {
		body, err = io.ReadAll(req.Body)
		// If we fail to create a request notify the client.
		if err != nil {
			res.WriteHeader(500)
			fmt.Fprintf(res, "Failed to generate proxy request (could not read http body) - %s", err)
			return
		}
	}

	// function to perform http request - we call this using backoff library to
	// have exponential backoff in case of intermittent failures (e.g. network
	// blips or HTTP 5xx errors)
	httpCall := func() (*http.Response, error, error) {
		proxyreq, err := http.NewRequest(req.Method, targetPath.String(), bytes.NewReader(body))
		if err != nil {
			return nil, nil, fmt.Errorf("error constructing request: %s", err)
		}
		maps.Copy(proxyreq.Header, req.Header)

		// for compatibility, if there is no request Content-Type and the body
		// has nonzero length, we add a Content-Type header.  See #3521.
		if _, ok := req.Header["Content-Type"]; !ok && len(body) != 0 {
			log.Printf("Adding missing Content-Type header (#3521)")
			proxyreq.Header["Content-Type"] = []string{"application/json"}
		}

		// Refresh Authorization header with each call...
		err = routes.Credentials.SignRequest(proxyreq)
		if err != nil {
			return nil, nil, err
		}
		var resp *http.Response
		resp, err = httpClient.Do(proxyreq)
		return resp, err, nil
	}

	proxyres, _, err := httpbackoff.Retry(httpCall)

	var resbody []byte
	if proxyres != nil {
		var err2 error
		resbody, err2 = io.ReadAll(proxyres.Body)
		if err == nil && err2 != nil {
			res.WriteHeader(500)
			fmt.Fprintf(res, "Failed to read response body: %s", err2)
			return
		}
	}

	// If we fail to create a request notify the client.
	if err != nil {
		switch err.(type) {
		case httpbackoff.BadHttpResponseCode:
			// nothing extra to do - header and body will be proxied back
		default:
			res.WriteHeader(500)
			fmt.Fprintf(res, "Failed during proxy request: %s", err)
			return
		}
	}

	// Map the headers from the proxy back into our proxyResponse
	for key := range proxyres.Header {
		res.Header().Set(key, proxyres.Header.Get(key))
	}

	// Write the proxyResponse headers and status.
	res.WriteHeader(proxyres.StatusCode)

	// Proxy the proxyResponse body from the endpoint to our response.
	_, err = res.Write([]byte(resbody))
	if err != nil {
		fmt.Fprintf(res, "Error writing res: %s", err)
		return
	}
}
