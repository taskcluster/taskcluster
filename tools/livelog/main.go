package main

import (
	"fmt"
	"log"
	"math"
	"net/http"
	"net/http/pprof"
	"os"
	"strconv"
	"sync"

	docopt "github.com/docopt/docopt-go"
	"github.com/taskcluster/taskcluster/v92/internal"
	stream "github.com/taskcluster/taskcluster/v92/tools/livelog/writer"
)

const (
	DEFAULT_PUT_PORT = 60022
	DEFAULT_GET_PORT = 60023
)

const usage = `Livelog

Usage: livelog [-h | --help | --short-version | --version]

Environment:
 LIVELOG_GET_PORT (required)	port on which to listen for GET requests to serve logs
 LIVELOG_PUT_PORT (required)	port on which to listen for PUT requests to receive logs
 ACCESS_TOKEN			an arbitrary url-safe string
 SERVER_CRT_FILE		path to a file containing a certificate, if not provided, the server will run without TLS
 SERVER_KEY_FILE		path to a file containing a key, if not provided, the server will run without TLS

Options:
-h --help       Show help
--short-version Show only the semantic version`

// Run an http.Server.  In production this is just `ListenAndServe`, but
// is overridden in testing to use ephemeral ports and ensure servers are
// shut down correctly.
var runServer func(server *http.Server, addr, crtFile, keyFile string) error

func abort(writer http.ResponseWriter) {
	// We need to hijack and abort the request...
	conn, _, err := writer.(http.Hijacker).Hijack()

	if err != nil {
		return
	}

	// Force the connection closed to signal that the response was not
	// completed...
	conn.Close()
}

func startLogServe(stream *stream.Stream, getAddr string) {
	// Get access token from environment variable
	accessToken := os.Getenv("ACCESS_TOKEN")

	routes := http.NewServeMux()
	routes.HandleFunc("/log/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("output %s %s", r.Method, r.URL.String())

		// Authenticate the request with accessToken, this is good enough because
		// live logs are short-lived, we do this by slicing away '/log/' from the
		// URL and comparing the reminder to the accessToken, ensuring a URL pattern
		// /log/<accessToken>
		if r.URL.String()[5:] != accessToken {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.WriteHeader(401)
			fmt.Fprint(w, "Access denied")
		} else {
			getLog(stream, w, r)
		}
	})

	server := http.Server{
		Handler: routes,
	}

	crtFile := os.Getenv("SERVER_CRT_FILE")
	keyFile := os.Getenv("SERVER_KEY_FILE")
	var err error
	if crtFile != "" && keyFile != "" {
		log.Printf("Output server listening... %s (with TLS)", server.Addr)
		log.Printf("key %s ", keyFile)
		log.Printf("crt %s ", crtFile)
		err = runServer(&server, getAddr, crtFile, keyFile)
	} else {
		log.Printf("Output server listening... %s (without TLS)", server.Addr)
		err = runServer(&server, getAddr, "", "")
	}
	if err != nil && err != http.ErrServerClosed {
		log.Fatalf("%s", err)
	}
}

// HTTP logic for serving the contents of a stream...
func getLog(
	stream *stream.Stream,
	writer http.ResponseWriter,
	req *http.Request,
) {
	// NOTE: this once attempted to support Range requests, but did so incorrectly:
	//
	// (a) returned bytes beginning at offset zero, even if the range did not
	//   begin there, when and only when those bytes had already been written to
	//   the backing store
	// (b) did not respond with 206 Partial Content
	// (c) did not respond with a Content-Range header
	// (d) was tested in such a way to to not trigger bug (a) and not check for
	//   (b) or (c)
	//
	// On the concluaion that such requests are not used, support has been
	// removed.
	handle := stream.Observe(0, math.MaxInt64)

	defer func() {
		// Ensure we close our file handle...
		// Ensure the stream is cleaned up after errors, etc...
		stream.Unobserve(handle)
		log.Print("send connection close...")
	}()

	// TODO: Allow the input stream to configure headers rather then assume
	// intentions...
	writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
	writer.Header().Set("Access-Control-Allow-Origin", "*")
	writer.Header().Set("Access-Control-Expose-Headers", "Transfer-Encoding")

	// Send headers so its clear what we are trying to do...
	writer.WriteHeader(200)
	log.Print("wrote headers...")

	// Begin streaming any pending results...
	_, writeToErr := handle.WriteTo(writer)
	if writeToErr != nil {
		log.Println("Error during write...", writeToErr)
		abort(writer)
	}
}

// Logic here mostly inspired by what docker does...
func attachProfiler(router *http.ServeMux) {
	router.HandleFunc("/debug/pprof/", pprof.Index)
	router.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	router.HandleFunc("/debug/pprof/profile", pprof.Profile)
	router.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	router.HandleFunc("/debug/pprof/heap", pprof.Handler("heap").ServeHTTP)
	router.HandleFunc("/debug/pprof/goroutine", pprof.Handler("goroutine").ServeHTTP)
	router.HandleFunc("/debug/pprof/threadcreate", pprof.Handler("threadcreate").ServeHTTP)
}

func main() {
	opts, _ := docopt.ParseArgs(usage, nil, "livelog "+internal.Version)

	if opts["--short-version"].(bool) {
		fmt.Println(internal.Version)
		os.Exit(0)
	}

	// TODO: Right now this is a collection of hacks until we build out something
	// nice which can handle multiple log connections. Right now the intent is to
	// use this as a process per task (which has overhead) but should be fairly
	// clean (memory wise) in the long run as we will terminate the process
	// frequently per task run.

	// portAddressOrExit is a helper function to translate a port number in an
	// envronment variable into a valid address string which can be used when
	// starting web service. This helper function will cause the go program to
	// exit if an invalid value is specified in the environment variable.
	portAddressOrExit := func(envVar string, defaultValue uint16, notANumberExitCode, outOfRangeExitCode int) (addr string) {
		addr = fmt.Sprintf(":%v", defaultValue)
		if port := os.Getenv(envVar); port != "" {
			p, err := strconv.Atoi(port)
			if err != nil {
				log.Printf("env var %v is not a number (%v)", envVar, port)
				os.Exit(notANumberExitCode)
			}
			if p < 0 || p > 65535 {
				log.Printf("env var %v is not between [0, 65535] (%v)", envVar, p)
				os.Exit(outOfRangeExitCode)
			}
			addr = ":" + port
		}
		return
	}

	putAddr := portAddressOrExit("LIVELOG_PUT_PORT", DEFAULT_PUT_PORT, 64, 65)
	getAddr := portAddressOrExit("LIVELOG_GET_PORT", DEFAULT_GET_PORT, 66, 67)

	runServer = func(server *http.Server, addr, crtFile, keyFile string) error {
		server.Addr = addr
		if crtFile != "" && keyFile != "" {
			return server.ListenAndServeTLS(crtFile, keyFile)
		} else {
			return server.ListenAndServe()
		}
	}

	serve(putAddr, getAddr)
}

func serve(putAddr, getAddr string) {
	handlingPut := false
	mutex := sync.Mutex{}

	routes := http.NewServeMux()

	if os.Getenv("DEBUG") != "" {
		attachProfiler(routes)
	}

	server := http.Server{
		Handler: routes,
	}

	// The "main" http server is for the PUT side which should not be exposed
	// publicly but via links in the docker container... In the future we can
	// handle something fancier.
	routes.HandleFunc("/log", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("input %s %s", r.Method, r.URL.String())

		if r.Method != "PUT" {
			log.Print("input not put")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("This endpoint can only handle PUT requests"))
			return
		}

		// Threadsafe checking of the `handlingPut` flag
		mutex.Lock()
		if handlingPut {
			log.Print("Attempt to put when in progress")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("This endpoint can only process one http PUT at a time"))
			mutex.Unlock() // used instead of defer so we don't block other rejections
			return
		}
		mutex.Unlock() // So we don't block other rejections...

		stream, streamErr := stream.NewStream(r.Body)

		if streamErr != nil {
			log.Printf("input stream open err %v", streamErr)
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("Could not open stream for body"))

			// Allow for retries of the initial put if something goes wrong...
			mutex.Lock()
			handlingPut = false
			mutex.Unlock()
		}

		// Signal initial success...
		w.WriteHeader(http.StatusCreated)

		// Initialize the sub server in another go routine...
		log.Print("Begin consuming...")
		go startLogServe(stream, getAddr)
		consumeErr := stream.Consume()
		if consumeErr != nil {
			log.Println("Error finalizing consume of stream", consumeErr)
			abort(w)
			return
		}
	})

	// Listen forever on the PUT side...
	log.Printf("input server listening... %s", server.Addr)
	// Main put server listens on the public root for the worker.
	err := runServer(&server, putAddr, "", "")
	if err != nil && err != http.ErrServerClosed {
		log.Fatalf("%s", err)
	}
}
