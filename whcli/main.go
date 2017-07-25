package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/auth"
	"github.com/taskcluster/webhooktunnel/util"
	"github.com/taskcluster/webhooktunnel/whclient"
)

// whclient <clientID> <accessToken> <targetPort>
const usage = `whcli <clientID> <accessToken> <targetPort>`

func main() {
	if len(os.Args) != 4 {
		panic(usage)
	}

	clientID, accessToken := os.Args[1], os.Args[2]
	targetPort, err := strconv.Atoi(os.Args[3])
	if err != nil || targetPort < 0 || targetPort > 65535 {
		panic(usage)
	}

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
		proxyURL := util.MakeWsURL(whtResponse.ProxyURL)
		return whclient.Config{
			ID:        whtResponse.TunnelID,
			Token:     whtResponse.Token,
			ProxyAddr: proxyURL,
			UseDomain: true,
		}, nil

	}

	client, err := whclient.New(configurer)
	if err != nil {
		panic(err)
	}

	fmt.Printf("URL: %s", client.URL())

	waitTime := 5 * time.Millisecond
	for {
		stream, err := client.Accept()
		if err != nil {
			ne, ok := err.(net.Error)
			if !ok || !ne.Temporary() {
				panic(err)
			}
			// wait if temporary
			time.Sleep(waitTime)
			waitTime = 2 * waitTime
			continue
		}
		// reset wait time
		waitTime = 5 * time.Millisecond
		fmt.Printf("new incoming stream")
		go forward(stream, targetPort)
	}
}

// forwards multiplexed stream to port
func forward(stream net.Conn, port int) {
	strPort := strconv.Itoa(port)
	conn, err := net.Dial("tcp", ":"+strPort)
	if err != nil {
		return
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(stream, conn)
	}()
	go func() {
		defer wg.Done()
		_, _ = io.Copy(conn, stream)
	}()
	wg.Wait()
}
