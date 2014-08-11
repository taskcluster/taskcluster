package main

import "net/http"

type Routes struct{}

func (r *Routes) ServeHTTP(writer http.ResponseWriter, req *http.Request) {
}

func main() {
	routes := &Routes{}
	server := &http.Server{
		Addr:    ":8080",
		Handler: routes,
	}

	server.ListenAndServe()
}
