package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go/tcclient"
	tc "github.com/taskcluster/taskcluster-proxy/taskcluster"
)

type Routes tcclient.ConnectionData

var tcServices = tc.NewServices()
var httpClient = &http.Client{}

func (self *Routes) signUrl(res http.ResponseWriter, req *http.Request) {
	// Using ReadAll could be sketchy here since we are reading unbounded data
	// into memory...
	body, err := ioutil.ReadAll(req.Body)

	if err != nil {
		res.WriteHeader(500)
		fmt.Fprintf(res, "Error reading body")
		return
	}

	urlString := strings.TrimSpace(string(body))
	cd := tcclient.ConnectionData(*self)
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

// Routes implements the `http.Handler` interface
func (self *Routes) ServeHTTP(res http.ResponseWriter, req *http.Request) {

	// A special case for the proxy is returning a bewit signed url.
	if req.URL.Path[0:6] == "/bewit" {
		self.signUrl(res, req)
		return
	}

	targetPath, err := tcServices.ConvertPath(req.URL)

	// Unkown service which we are trying to hit...
	if err != nil {
		res.WriteHeader(404)
		log.Printf("Attempting to use unkown service %s", req.URL.String())
		fmt.Fprintf(res, "Unkown taskcluster service: %s", err)
		return
	}

	log.Printf("Proxying %s | %s | %s", req.URL, req.Method, targetPath)

	payload := (*json.RawMessage)(nil)
	if req.Body != nil {
		body, err := ioutil.ReadAll(req.Body)
		// If we fail to create a request notify the client.
		if err != nil {
			res.WriteHeader(500)
			fmt.Fprintf(res, "Failed to generate proxy request (could not read http body) - %s", err)
			return
		}
		payload = new(json.RawMessage)
		err = json.Unmarshal(body, payload)
		if err != nil {
			res.WriteHeader(400)
			fmt.Fprintf(res, "Malformed payload - http request body is not valid json - %s", err)
			return
		}
	}

	cd := tcclient.ConnectionData(*self)
	_, cs, err := (&cd).APICall(payload, req.Method, targetPath.String(), new(json.RawMessage), nil)
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
	headersToSend := res.Header()
	for key, _ := range cs.HttpResponse.Header {
		headersToSend.Set(key, cs.HttpResponse.Header.Get(key))
	}

	headersToSend.Set("X-Taskcluster-Endpoint", targetPath.String())
	headersToSend.Set("X-Taskcluster-Proxy-Version", version)

	// Write the proxyResponse headers and status.
	res.WriteHeader(cs.HttpResponse.StatusCode)

	// Proxy the proxyResponse body from the endpoint to our response.
	res.Write([]byte(cs.HttpResponseBody))
}
