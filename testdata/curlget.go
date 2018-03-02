package main

import (
	"io"
	"log"
	"net/http"
	"os"
)

func main() {
	if len(os.Args) != 2 {
		log.Fatal("Usage: go run curlget.go <url>")
	}
	res, err := http.Get(os.Args[1])
	if err != nil {
		log.Fatalf("%v", err)
	}
	defer res.Body.Close()
	_, err = io.Copy(os.Stdout, res.Body)
	if err != nil {
		log.Fatalf("%v", err)
	}
}
