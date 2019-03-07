package main

import (
	"io"
	"log"
	"net/http"
	"os"
	"strings"
)

func main() {
	if len(os.Args) != 2 {
		log.Fatal("Usage: go run curlget.go <url>\n<url> will have the current $TASKCLUSTER_PROXY_URL substituted for the string TASKCLUSTER_PROXY_URL")
	}
	url := os.Args[1]
	url = strings.Replace(url, "TASKCLUSTER_PROXY_URL", os.Getenv("TASKCLUSTER_PROXY_URL"), -1)
	res, err := http.Get(url)
	if err != nil {
		log.Fatalf("%v", err)
	}
	defer res.Body.Close()
	_, err = io.Copy(os.Stdout, res.Body)
	if err != nil {
		log.Fatalf("%v", err)
	}
}
