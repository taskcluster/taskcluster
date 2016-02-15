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
	"github.com/taskcluster/taskcluster-client-go/tcclient"
	tc "github.com/taskcluster/taskcluster-proxy/taskcluster"
)

type Routes struct {
	tcclient.ConnectionData
	lock sync.RWMutex
}

type CredentialsUpdate struct {
	ClientId    string `json:"clientId"`
	AccessToken string `json:"accessToken"`
	Certificate string `json:"certificate"`
}

var tcServices = tc.NewServices()
var httpClient = &http.Client{}

func (self *Routes) setHeaders(res http.ResponseWriter) {
	headersToSend := res.Header()
	headersToSend.Set("X-Taskcluster-Proxy-Version", version)
	cert, err := self.Credentials.Cert()
	if cert != nil {
		if err != nil {
			res.WriteHeader(500)
			// Note, self.Credentials does not expose secrets when rendered as a string
			fmt.Fprintf(res, "TaskCluster Proxy has invalid certificate: %v\n%v", self.Credentials, err)
			return
		} else {
			headersToSend.Set("X-Taskcluster-Proxy-Temp-Scopes", fmt.Sprintf("%s", cert.Scopes))
		}
	} else {
		headersToSend.Set("X-Taskcluster-Proxy-Perm-ClientId", fmt.Sprintf("%s", self.Credentials.ClientId))
	}
	if authScopes := self.Credentials.AuthorizedScopes; authScopes != nil {
		headersToSend.Set("X-Taskcluster-Authorized-Scopes", fmt.Sprintf("%s", authScopes))
	}
}

// HTTP Handling for /bewit
func (self *Routes) BewitHandler(res http.ResponseWriter, req *http.Request) {
	// Using ReadAll could be sketchy here since we are reading unbounded data
	// into memory...
	self.setHeaders(res)
	body, err := ioutil.ReadAll(req.Body)

	if err != nil {
		res.WriteHeader(500)
		fmt.Fprintf(res, "Error reading body")
		return
	}

	urlString := strings.TrimSpace(string(body))

	cd := tcclient.ConnectionData(self.ConnectionData)
	bewitUrl, err := (&cd).SignedURL(urlString, nil, time.Hour*1)

	if err != nil {
		res.WriteHeader(500)
		fmt.Fprintf(res, "Error creating bewit url")
		return
	}

	headers := res.Header()
	headers.Set("Location", bewitUrl.String())
	res.WriteHeader(303)
	fmt.Fprintf(res, bewitUrl.String())
}

// HTTP Handling for /credentials
func (self *Routes) CredentialsHandler(res http.ResponseWriter, req *http.Request) {
	self.setHeaders(res)
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

	self.lock.Lock()
	defer self.lock.Unlock()
	self.Credentials.ClientId = credentials.ClientId
	self.Credentials.AccessToken = credentials.AccessToken
	self.Credentials.Certificate = credentials.Certificate

	res.WriteHeader(200)
}

// HTTP Handling for /
func (self *Routes) RootHandler(res http.ResponseWriter, req *http.Request) {
	self.setHeaders(res)
	self.lock.RLock()
	defer self.lock.RUnlock()

	targetPath, err := tcServices.ConvertPath(req.URL)

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

	cd := tcclient.ConnectionData(self.ConnectionData)
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
	for key, _ := range cs.HttpResponse.Header {
		res.Header().Set(key, cs.HttpResponse.Header.Get(key))
	}

	// Write the proxyResponse headers and status.
	res.WriteHeader(cs.HttpResponse.StatusCode)

	// Proxy the proxyResponse body from the endpoint to our response.
	res.Write([]byte(cs.HttpResponseBody))
}
