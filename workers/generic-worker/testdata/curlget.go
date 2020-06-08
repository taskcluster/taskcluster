package main

import (
	"encoding/base64"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"os"
	"strings"
)

func main() {
	if len(os.Args) != 2 {
		log.Fatal("Usage: go run curlget.go <base64 encoded url>\n<base64 encoded url> will have the current $TASKCLUSTER_PROXY_URL substituted for the string TASKCLUSTER_PROXY_URL")
	}
	base64EncodedURL := os.Args[1]
	urlBytes, err := base64.StdEncoding.DecodeString(base64EncodedURL)
	if err != nil {
		log.Fatalf("%v", err)
	}
	log.Printf("Program arguments: %#v", os.Args)
	url := strings.Replace(string(urlBytes), "TASKCLUSTER_PROXY_URL", os.Getenv("TASKCLUSTER_PROXY_URL"), -1)
	log.Printf("URL: %#v", url)
	res, err := http.Get(url)
	if err != nil {
		log.Fatalf("%v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		reqbytes, err := httputil.DumpRequest(res.Request, true)
		if err != nil {
			log.Fatalf("%v", err)
		}
		log.Print(string(reqbytes))
		resbytes, err := httputil.DumpResponse(res, true)
		if err != nil {
			log.Fatalf("%v", err)
		}
		log.Printf("Response code: %v / %v", res.Status, res.StatusCode)
		log.Print(string(resbytes))
		os.Exit(1)
	}
	_, err = io.Copy(os.Stdout, res.Body)
	if err != nil {
		log.Fatalf("%v", err)
	}
}
