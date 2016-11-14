package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/pprof"
	"os"
	"sync"

	stream "github.com/taskcluster/livelog/writer"
	. "github.com/visionmedia/go-debug"
)

var debug = Debug("livelog")

func abort(writer http.ResponseWriter) error {
	// We need to hijack and abort the request...
	conn, _, err := writer.(http.Hijacker).Hijack()

	if err != nil {
		return err
	}

	// Force the connection closed to signal that the response was not
	// completed...
	conn.Close()
	return nil
}

func startLogServe(stream *stream.Stream) {
	// Get access token from environment variable
	accessToken := os.Getenv("ACCESS_TOKEN")

	routes := http.NewServeMux()
	routes.HandleFunc("/log/", func(w http.ResponseWriter, r *http.Request) {
		debug("output %s %s", r.Method, r.URL.String())

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
		Addr:    ":60023",
		Handler: routes,
	}

	crtFile := os.Getenv("SERVER_CRT_FILE")
	keyFile := os.Getenv("SERVER_KEY_FILE")
	if crtFile != "" && keyFile != "" {
		debug("Output server listening... %s (with TLS)", server.Addr)
		debug("key %s ", keyFile)
		debug("crt %s ", crtFile)
		server.ListenAndServeTLS(crtFile, keyFile)
	} else {
		debug("Output server listening... %s (without TLS)", server.Addr)
		server.ListenAndServe()
	}
}

// HTTP logic for serving the contents of a stream...
func getLog(
	stream *stream.Stream,
	writer http.ResponseWriter,
	req *http.Request,
) {
	rng, rngErr := ParseRange(req.Header)

	if rngErr != nil {
		log.Printf("Invalid range : %s", req.Header.Get("Range"))
		writer.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
		writer.Write([]byte(rngErr.Error()))
		return
	}

	handle := stream.Observe(rng.Start, rng.Stop)

	defer func() {
		// Ensure we close our file handle...
		// Ensure the stream is cleaned up after errors, etc...
		stream.Unobserve(handle)
		debug("send connection close...")
	}()

	// TODO: Allow the input stream to configure headers rather then assume
	// intentions...
	writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
	writer.Header().Set("Access-Control-Allow-Origin", "*")
	writer.Header().Set("Transfer-Encoding", "chunked")
	writer.Header().Set("Access-Control-Expose-Headers", "Transfer-Encoding")

	log.Printf("%v", req.Header)

	// Send headers so its clear what we are trying to do...
	writer.WriteHeader(200)
	debug("wrote headers...")

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
	// TODO: Right now this is a collection of hacks until we build out something
	// nice which can handle multiple log connections. Right now the intent is to
	// use this as a process per task (which has overhead) but should be fairly
	// clean (memory wise) in the long run as we will terminate the process
	// frequently per task run.

	handlingPut := false
	mutex := sync.Mutex{}

	routes := http.NewServeMux()

	if os.Getenv("DEBUG") != "" {
		attachProfiler(routes)
	}

	server := http.Server{
		// Main put server listens on the public root for the worker.
		Addr:    ":60022",
		Handler: routes,
	}

	// The "main" http server is for the PUT side which should not be exposed
	// publicly but via links in the docker container... In the future we can
	// handle something fancier.
	routes.HandleFunc("/log", func(w http.ResponseWriter, r *http.Request) {
		debug("input %s %s", r.Method, r.URL.String())

		if r.Method != "PUT" {
			debug("input not put")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte("This endpoint can only handle PUT requests"))
			return
		}

		// Threadsafe checking of the `handlingPut` flag
		mutex.Lock()
		if handlingPut {
			debug("Attempt to put when in progress")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte("This endpoint can only process one http PUT at a time"))
			mutex.Unlock() // used instead of defer so we don't block other rejections
			return
		}
		mutex.Unlock() // So we don't block other rejections...

		stream, streamErr := stream.NewStream(r.Body)

		if streamErr != nil {
			debug("input stream open err", streamErr)
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte("Could not open stream for body"))

			// Allow for retries of the initial put if something goes wrong...
			mutex.Lock()
			handlingPut = false
			mutex.Unlock()
		}

		// Signal initial success...
		w.WriteHeader(http.StatusCreated)

		// Initialize the sub server in another go routine...
		debug("Begin consuming...")
		go startLogServe(stream)
		consumeErr := stream.Consume()
		if consumeErr != nil {
			log.Println("Error finalizing consume of stream", consumeErr)
			abort(w)
			return
		}
	})

	// Listen forever on the PUT side...
	debug("input server listening... %s", server.Addr)
	server.ListenAndServe()
}
