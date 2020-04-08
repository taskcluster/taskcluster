package main

import (
	"bufio"
	"io"
	"net"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"

	set "github.com/deckarep/golang-set"
	"github.com/docopt/docopt-go"
	log "github.com/sirupsen/logrus"
	"github.com/taskcluster/websocktunnel/client"
)

const usage = `Websocketunnel Client is a command line utility which establishes a connection
to the websocktunnel service and allows serving http without exposing ports to 
the internet.

[Firewall/NAT [User] <--]---> [websocktunnel] <--- [Web]

Usage:
    wst-client <wstServer> <wstClientID> <targetPort> [--token <jwtToken>] [--out-file=<outFile>]
	           [--verbose] [--json] 
    wst-client -h | --help

The wstClientID is the ID to register with the websocktunnel server.  The JWT
token must authorize the same ID.

If --token is not provided, then each line of input on stdin will be treated as
a token as soon as it arrives.  This allows wst-client to operate as a
subprocess of some other server for which it is managing the tunnel.  That
server can then "feed" wst-client a new token before the most recent token
expires.

Options:
-h --help               Show help
--verbose               Verbose logging
--token                 JWT Token, if not given on stdin (see above)
--out-file=<outFile>    Dump url to this file
--json                  Output logs in JSON format`

const closeWait = 2 * time.Second

func main() {
	arguments, _ := docopt.Parse(usage, nil, true, "Websocktunnel Client 0.1", false)

	var jwtToken string
	wstServer, wstClientID := arguments["<wstServer>"].(string), arguments["<wstClientID>"].(string)
	if arguments["<jwtToken>"] != nil {
		jwtToken = arguments["<jwtToken>"].(string)
	}

	targetPort, err := strconv.Atoi(arguments["<targetPort>"].(string))
	if err != nil || targetPort < 0 || targetPort > 65535 {
		log.Fatal(usage)
	}

	outFile := ""
	if arguments["--out-file"] != nil {
		outFile = arguments["--out-file"].(string)
	}

	if arguments["--json"].(bool) {
		log.SetFormatter(&log.JSONFormatter{})
	}

	if arguments["--verbose"].(bool) {
		log.SetLevel(log.DebugLevel)
	}

	// Configure signals for graceful handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// hold count of running connections
	var running sync.WaitGroup
	// used for set operations
	count := uint64(0)
	runSet := set.NewSet()
	run := true
	// accept new streams from this channel
	strChan := make(chan net.Conn, 1)

	client, err := client.New(makeConfigurer(wstServer, wstClientID, jwtToken))
	if err != nil {
		log.Fatal(err)
	}

	go func() {
		waitTime := 5 * time.Millisecond // default wait time when connection fails
		for {
			// This simulates http.Server's Serve method
			stream, err := client.Accept()
			if err != nil {
				ne, ok := err.(net.Error)
				if !ok || !ne.Temporary() {
					log.Fatal(err)
				}
				// wait if temporary
				time.Sleep(waitTime)
				waitTime = 2 * waitTime
				continue
			}
			// reset wait time
			waitTime = 5 * time.Millisecond

			strChan <- stream
		}
	}()

	defer func() {
		_ = client.Close()
		close(strChan)
		close(sigChan)
	}()

	whurl := client.URL()
	log.WithFields(log.Fields{"url": whurl}).Info("connected to websocktunnel")
	// dump if outFile provided
	if outFile != "" {
		file, err := os.Create(outFile)
		if err != nil {
			panic(err)
		}
		_, _ = file.Write([]byte(whurl))
		_ = file.Close()
		log.WithFields(log.Fields{"url": whurl, "file": outFile}).Info("wrote url to file")
	}

	for run {
		select {
		case <-sigChan:
			run = false
			done := make(chan struct{})
			go func() {
				running.Wait()
				close(done)
			}()
			select {
			case <-time.After(closeWait):
			case <-done:
			}
			os.Exit(0)
		case stream := <-strChan:
			log.Debug("Accepting new connection")
			f := &forwarder{
				stream: stream,
				port:   targetPort,
				count:  count,
			}
			f.notify = func() {
				defer running.Done()
				runSet.Remove(f)
			}

			count++
			_ = runSet.Add(f)
			running.Add(1)
			go f.forward()
		}
	}
}

// struct for handling connection forwarding
type forwarder struct {
	stream net.Conn
	conn   net.Conn
	port   int
	count  uint64
	notify func()
}

// forwards multiplexed stream to port
func (f *forwarder) forward() {
	var err error
	strPort := strconv.Itoa(f.port)
	f.conn, err = net.Dial("tcp", ":"+strPort)
	defer f.notify()
	// just to be sure
	defer f.kill()
	if err != nil {
		return
	}

	var wg sync.WaitGroup

	wg.Add(2)
	// outgoing stream (local -> tunnel)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(f.stream, f.conn)
		_ = f.stream.Close()
	}()

	// incoming stream (tunnel -> local)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(f.conn, f.stream)
		_ = f.conn.Close()
	}()
	wg.Wait()
}

func (f *forwarder) kill() {
	if f.stream != nil {
		_ = f.stream.Close()
	}
	if f.conn != nil {
		_ = f.conn.Close()
	}
}

func makeConfigurer(wstServer, wstClientID, jwtToken string) func() (client.Config, error) {
	if jwtToken != "" {
		configurer := func() (client.Config, error) {
			return client.Config{
				ID:         wstClientID,
				Token:      jwtToken,
				TunnelAddr: wstServer,
			}, nil
		}
		return configurer
	}

	// we now have the more complex case of getting updated JWTs on stdin

	// define a condition variable over the `jwtToken` local variable
	var mux sync.Mutex
	var cond = sync.NewCond(&mux)

	// read from stdin, rewriting `token` on each
	go func() {
		reader := bufio.NewReader(os.Stdin)
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				log.Warningf("error reading stdin; no more JWT tokens will be read: %s", err)
				return
			}

			log.Debug("Got new JWT token on stdin")
			mux.Lock()
			jwtToken = line
			cond.Broadcast()
			mux.Unlock()
		}
	}()

	configurer := func() (client.Config, error) {
		log.Info("Reconfiguring")
		mux.Lock()
		for jwtToken == "" {
			log.Debug("Waiting for first JWT token on stdin")
			cond.Wait()
		}
		token := jwtToken
		mux.Unlock()

		return client.Config{
			ID:         wstClientID,
			Token:      token,
			TunnelAddr: wstServer,
		}, nil
	}
	return configurer
}
