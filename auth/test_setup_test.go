package auth

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/cenkalti/backoff"
)

var (
	auth     Auth
	expires  time.Time
	err      error
	handler  *MyHandler
	listener net.Listener
	server   *http.Server
)

// Handler for stubbing http requests from auth API endpoint
type MyHandler struct {
	QueuedResponses []HTTPResponse
}

type HTTPResponse struct {
	body       string
	statusCode int
}

// Fake auth endpoint
func (this *MyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	response := this.QueuedResponses[0]
	this.QueuedResponses = this.QueuedResponses[1:]
	w.WriteHeader(response.statusCode)
	io.WriteString(w, response.body)
}

func (this *MyHandler) QueueResponse(body string, statusCode int) {
	this.QueuedResponses = append(this.QueuedResponses, HTTPResponse{body: body, statusCode: statusCode})
}

func (this *MyHandler) ClearResponseQueue() {
	this.QueuedResponses = make([]HTTPResponse, 0)
}

func NewMyHandler() *MyHandler {
	return &MyHandler{QueuedResponses: make([]HTTPResponse, 0)}
}

// Custom setup and tear down
func TestMain(m *testing.M) {

	// Set up test data ....
	auth = Auth{Authenticate: false, BaseURL: "http://localhost:50849/api/AuthAPI/v1"}
	BackOffSettings = &backoff.ExponentialBackOff{
		InitialInterval:     1 * time.Millisecond,
		RandomizationFactor: 0.2,
		Multiplier:          1.2,
		MaxInterval:         5 * time.Millisecond,
		MaxElapsedTime:      20 * time.Millisecond,
		Clock:               backoff.SystemClock,
	}

	expires, err = time.Parse(
		"Jan 2, 2006 at 3:04pm -0700 (MST)",
		"Jul 9, 2012 at 5:02am -0800 (PST)",
	)
	if err != nil {
		fmt.Println("ERROR: Unable to generate a time.Time instance from a constant text string - very bizarre if this ever happens...")
		fmt.Printf("%v\n", err)
		os.Exit(1)
	}

	// Stub auth API endpoint ....

	err = startServingHTTP()
	if err != nil {
		fmt.Println("ERROR: unable to serve HTTP for stub auth service!")
		fmt.Printf("%v\n", err)
		os.Exit(1)
	}

	// Start the listener...
	go server.Serve(listener)

	// Run all the tests...
	returnCode := m.Run()

	// Tear down
	err = stopServingHTTP()
	if err != nil {
		fmt.Println("ERROR: Failed to shut down http server")
		fmt.Printf("%v\n", err)
	}
	os.Exit(returnCode)
}

// start up http service
func startServingHTTP() error {
	handler = NewMyHandler()
	server = &http.Server{Addr: ":50849", Handler: handler}
	listener, err = net.Listen("tcp", ":50849")
	return err
}

// bring down http service
func stopServingHTTP() error {
	server.SetKeepAlivesEnabled(false)
	return listener.Close()
}
