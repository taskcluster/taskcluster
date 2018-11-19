package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/taskcluster/httpbackoff"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	tc "github.com/taskcluster/taskcluster-proxy/taskcluster"
)

// Routes represents the context of the running service
type Routes struct {
	RootURL string
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

var httpClient = &http.Client{}

// NewRoutes creates a new Routes instance.
func NewRoutes(rootURL string, client tcclient.Client) Routes {
	return Routes{
		RootURL:  rootURL,
		Client:   client,
		services: tc.NewServices(rootURL),
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
		headersToSend.Set("X-Taskcluster-Proxy-Perm-ClientId", fmt.Sprintf("%s", routes.Credentials.ClientID))
	} else {
		headersToSend.Set("X-Taskcluster-Proxy-Temp-ClientId", fmt.Sprintf("%s", routes.Credentials.ClientID))
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

// BewitHandler is the http handler that provides Hawk signed urls (bewits)
func (routes *Routes) BewitHandler(res http.ResponseWriter, req *http.Request) {
	// Using ReadAll could be sketchy here since we are reading unbounded data
	// into memory...
	routes.setHeaders(res)
	body, err := ioutil.ReadAll(req.Body)

	if err != nil {
		res.WriteHeader(500)
		fmt.Fprintf(res, "Error reading body: %s", err)
		return
	}

	urlString := strings.TrimSpace(string(body))

	cd := tcclient.Client(routes.Client)
	bewitURL, err := (&cd).SignedURL(urlString, nil, time.Hour*1)

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
	if req.Body != nil {
		body, err = ioutil.ReadAll(req.Body)
		// If we fail to create a request notify the client.
		if err != nil {
			res.WriteHeader(500)
			fmt.Fprintf(res, "Failed to generate proxy request (could not read http body) - %s", err)
			return
		}
	}

	cd := tcclient.Client(routes.Client)
	cs, err := (&cd).Request(body, req.Method, targetPath.String(), nil)
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
	for key := range cs.HTTPResponse.Header {
		res.Header().Set(key, cs.HTTPResponse.Header.Get(key))
	}

	// Write the proxyResponse headers and status.
	res.WriteHeader(cs.HTTPResponse.StatusCode)

	// Proxy the proxyResponse body from the endpoint to our response.
	res.Write([]byte(cs.HTTPResponseBody))
}
