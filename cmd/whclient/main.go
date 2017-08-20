package main

import (
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
	"github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/auth"
	"github.com/taskcluster/webhooktunnel/whclient"
)

const usage = `Webhooktunnel Client
Webhooktunnel Client is a command line utility which establishes a connection
to the webhooktunnel proxy and allows serving http without exposing ports to 
the internet.

[Firewall/NAT [User] <--]---> [Proxy] <--- [Web]

Usage: whclient <clientID> <accessToken> <targetPort>
whclient -h | --help

Options:
-h --help Show help`

const closeWait = 2 * time.Second

func main() {
	log.SetFormatter(&log.JSONFormatter{})

	arguments, _ := docopt.Parse(usage, nil, true, "Webhook Client 0.1", false)

	clientID, accessToken := arguments["<clientID>"].(string), arguments["<accessToken>"].(string)
	targetPort, err := strconv.Atoi(arguments["<targetPort>"].(string))
	if err != nil || targetPort < 0 || targetPort > 65535 {
		log.Fatal(usage)
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

	client, err := whclient.New(makeConfigurer(clientID, accessToken))
	if err != nil {
		log.Fatal(err)
	}

	go func() {
		for {
			// This simulates http.Server's Serve method
			waitTime := 5 * time.Millisecond // default wait time when connection fails
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

	log.WithFields(log.Fields{"url": client.URL()}).Info("connected to proxy")

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
	// outgoing stream (local -> proxy)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(f.stream, f.conn)
		_ = f.stream.Close()
	}()

	// incoming stream (proxy -> local)
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

func makeConfigurer(clientID, accessToken string) func() (whclient.Config, error) {
	configurer := func() (whclient.Config, error) {
		creds := &tcclient.Credentials{
			ClientID:    clientID,
			AccessToken: accessToken,
		}
		myAuth := auth.New(creds)
		whtResponse, err := myAuth.WebhooktunnelToken()
		if err != nil {
			return whclient.Config{}, err
		}
		return whclient.Config{
			ID:        whtResponse.TunnelID,
			Token:     whtResponse.Token,
			ProxyAddr: whtResponse.ProxyURL,
		}, nil
	}
	return configurer
}
