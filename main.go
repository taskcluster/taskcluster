package main

import (
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	stream "github.com/lightsofapollo/continuous-log-serve/writer"
	. "github.com/visionmedia/go-debug"
)

var debug = Debug("continuous-log-serve")

var OBSERVE_TIMEOUT = time.Second * 10
var OBSERVE_EVENT_TIMEOUT = time.Second * 30

type Routes struct {
	stream *stream.Stream
}

func NewRoutes(stream *stream.Stream) *Routes {
	return &Routes{
		stream: stream,
	}
}

func (self *Routes) ServeHTTP(writer http.ResponseWriter, req *http.Request) {
	// Ensure we don't lock up while trying to serve request...
	timeout := time.After(OBSERVE_TIMEOUT)
	// Begin listening (this involves locks so we use a timeout...)
	pendingHandle := make(chan *stream.StreamHandle, 1)
	go func() {
		pendingHandle <- self.stream.Observe()
	}()

	var handle *stream.StreamHandle
	select {
	case handle = <-pendingHandle:
	case <-timeout:
		log.Println("Timeout while aquiring stream handle...")
		writer.WriteHeader(500)
		writer.Write([]byte("Cannot aquire stream... Please retry."))
		return
	}

	defer func() {
		// Ensure we close our file handle...
		// Ensure the stream is cleaned up after errors, etc...
		self.stream.Unobserve(handle)
		debug("send connection close...")
	}()

	file, err := os.Open(self.stream.File.Name())

	req.Header.Set("Content-Type", "text/plain; charset=utf-8")
	req.Header.Set("Content-Encoding", "chunked")

	if err != nil {
		writer.WriteHeader(500)
		writer.Write([]byte("Could not open writer file..."))
		return
	}

	// Send headers so its clear what we are trying to do...
	writer.WriteHeader(200)
	debug("wrote headers...")

	// Keep a record of the starting offset to verify we copied the right
	// things...
	startingOffset := self.stream.Offset

	// Begin by reading data from the file sink.
	io.CopyN(writer, file, int64(self.stream.Offset))

	if self.stream.Ended {
		// Handle the edge case where the file has ended while we where coping bytes
		// over above.
		if startingOffset != self.stream.Offset {
			io.Copy(writer, file) // copy drains entire file until EOF
		}
		return
	}

	// Always trigger an initial flush before waiting for more data who knows
	// when the events will filter in...
	writer.(http.Flusher).Flush()

	for {
		timeout := time.After(OBSERVE_EVENT_TIMEOUT)
		select {
		case <-timeout:
			log.Println("Timeout while waiting for event...")
			// TODO: We need to "abort" the connection here rather then finish the
			// request cleanly!
			return
		case event := <-handle.Events:
			// XXX: This should be safe from null deref since we always set a buffer
			// but is a potential bug here...
			_, writeErr := writer.Write((*event.Bytes)[0:event.Length])
			debug("writing %d bytes at offset %d", event.Length, event.Offset)
			// XXX: Make the flushing time based...
			writer.(http.Flusher).Flush()

			if writeErr != nil {
				log.Println("Write error", writeErr)
				return
			}

			if event.Err != nil {
				log.Println("Error handling event", event.Err)
				return
			}

			if event.End {
				// Successful end...
				return
			}
		}
	}
}

func inputHandler(conn net.Conn) {
	defer conn.Close()
	// Create the stream server...
	listener, err := net.Listen("tcp", ":60023")
	if err != nil {
		log.Fatal("Could not create listener...")
	}

	stream, err := stream.NewStream(conn)
	if err != nil {
		log.Fatal("Failed to open writer stream")
	}

	// Begin consuming data from the underlying stream...
	go func() {
		debug("consuming from stream...")
		err := stream.Consume()
		if err != nil {
			log.Fatal("Consume error", err)
		}
	}()

	mux := http.NewServeMux()
	mux.Handle("/log", NewRoutes(stream))
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/heap", pprof.Handler("heap").ServeHTTP)
	mux.HandleFunc("/debug/pprof/goroutine", pprof.Handler("goroutine").ServeHTTP)
	mux.HandleFunc("/debug/pprof/threadcreate", pprof.Handler("threadcreate").ServeHTTP)

	server := &http.Server{
		Handler: mux,
	}

	_, port, err := net.SplitHostPort(listener.Addr().String())
	debug("http server listening on %s", port)
	if err != nil {
		log.Fatal("Failed to aquire port")
	}

	log.Printf("http://localhost:%s/", port)

	// Begin serving ...
	wait := sync.WaitGroup{}
	wait.Add(1)
	go func() {
		err = server.Serve(listener)
		if err != nil {
			log.Fatal("Error serving request", err)
		}
		wait.Done()
	}()
	wait.Wait()
}

func main() {
	dir, err := os.Getwd()
	if err != nil {
		log.Fatal("getwd error", err)
	}

	socket := fmt.Sprintf("%s/input.sock", dir)
	signalChan := make(chan os.Signal)
	signal.Notify(signalChan, syscall.SIGINT)
	debug("open socket %s", socket)

	// Cleanup on SIGINT
	go func() {
		<-signalChan
		os.Remove(socket)
		debug("SIGINT")
		os.Exit(1)
	}()

	server, err := net.Listen("unix", socket)
	defer os.Remove(socket)

	if err != nil {
		log.Fatal("Failed to open input socket ", socket)
	}

	defer server.Close()

	for {
		conn, err := server.Accept()
		if err != nil {
			log.Println("Error accepting connection...", err)
			continue
		}
		go inputHandler(conn)
	}
}
