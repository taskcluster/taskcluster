package main

import (
	"fmt"
	tc "github.com/lightsofapollo/taskcluster-proxy/taskcluster"
	"io"
	"log"
	"net/http"
)

type Routes struct {
	// Client ID used to authenticate all proxy requests.
	ClientId string

	// Access Token used to authenticate all proxy requests.
	AccessToken string

	// Scopes to use in the delegating authentication.
	Scopes []string
}

var tcServices = tc.NewServices()
var httpClient = &http.Client{}

// Routes implements the `http.Handler` interface
func (self Routes) ServeHTTP(res http.ResponseWriter, req *http.Request) {
	targetPath, err := tcServices.ConvertPath(req.URL)

	// Unkown service which we are trying to hit...
	if err != nil {
		res.WriteHeader(404)
		log.Printf("Attempting to use unkown service %s", req.URL.String())
		fmt.Fprintf(res, "Unkown taskcluster service: %s", err)
		return
	}

	// Copy method and body over to the proxy request.
	log.Printf("Proxying %s | %s | %s", req.URL, req.Method, targetPath)
	proxyReq, err := http.NewRequest(req.Method, targetPath.String(), req.Body)
	// If we fail to create a request notify the client.
	if err != nil {
		res.WriteHeader(500)
		fmt.Fprintf(res, "Failed to generate proxy request: %s", err)
		return
	}

	// Copy all headers over to the proxy request.
	for key, _ := range req.Header {
		// Do not forward connection!
		if key == "Connection" {
			continue
		}

		proxyReq.Header.Set(key, req.Header.Get(key))
	}

	// Sign the proxy request with our credentials.
	auth, err := tc.AuthorizationDelegate(
		self.ClientId, self.AccessToken, self.Scopes, proxyReq,
	)
	if err != nil {
		res.WriteHeader(500)
		fmt.Fprintf(res, "Failed to sign proxy request")
		return
	}
	proxyReq.Header.Set("Authorization", auth)

	// Issue the proxy request...
	proxyResp, err := httpClient.Do(proxyReq)

	if err != nil {
		res.WriteHeader(500)
		fmt.Fprintf(res, "Failed during proxy request: %s", err)
		return
	}

	// Map the headers from the proxy back into our proxyResponse
	headersToSend := res.Header()
	for key, _ := range proxyResp.Header {
		headersToSend.Set(key, proxyResp.Header.Get(key))
	}

	headersToSend.Set("X-Taskcluster-Endpoint", targetPath.String())

	// Write the proxyResponse headers and status.
	res.WriteHeader(proxyResp.StatusCode)

	// Proxy the proxyResponse body from the endpoint to our response.
	io.Copy(res, proxyResp.Body)
	proxyResp.Body.Close()
}
