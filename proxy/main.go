package main

import (
	tc "github.com/lightsofapollo/taskcluster-proxy/taskcluster"
	"fmt"
	"net/http"
	"log"
	"io"
)

var tcServices = tc.NewServices()
var httpClient = &http.Client{};

func handler(w http.ResponseWriter, r *http.Request) {
	targetPath, err := tcServices.ConvertPath(r.URL);

	// Unkown service which we are trying to hit...
	if err != nil {
		w.WriteHeader(404);
		log.Printf("Attempting to use unkown service %s", r.URL.String())
		fmt.Fprintf(w, "Unkown taskcluster service: %s", err)
		return
	}

	// Copy method and body over to the proxy request.
	log.Printf("Proxying %s | %s | %s", r.URL, r.Method, targetPath)
	proxyReq, err := http.NewRequest(r.Method, targetPath.String(), r.Body)

	// If we fail to create a request notify the client.
	if err != nil {
		w.WriteHeader(500)
		fmt.Fprintf(w, "Failed to generate proxy request: %s", err)
		return
	}

	// Copy all headers over to the proxy request.
	for key, _ := range r.Header {
		// Do not forward connection!
		if key == "Connection" {
			continue
		}

		proxyReq.Header.Set(key, r.Header.Get(key))
	}

	resp, err := httpClient.Do(proxyReq)

	if err != nil {
		w.WriteHeader(500)
		fmt.Fprintf(w, "Failed during proxy request: %s", err)
		return
	}

	// Map the headers from the proxy back into our response
	headersToSend := w.Header()
	for key, _ := range resp.Header {
		headersToSend.Set(key, resp.Header.Get(key))
	}

	headersToSend.Set("X-Taskcluster-Endpoint", targetPath.String())

	// Write the response headers and status.
	w.WriteHeader(resp.StatusCode)

	// Proxy the response body from the endpoint to our response.
	io.Copy(w, resp.Body)
	resp.Body.Close()
}

func main() {
	http.HandleFunc("/", handler)
	http.ListenAndServe(":8080", nil)
}
