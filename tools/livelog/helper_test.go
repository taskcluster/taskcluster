package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"testing"
)

func listenOnRandomPort() (net.Listener, uint16, error) {
	// allocate a port dynamically by specifying :0
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return nil, 0, err
	}

	// retrive the selected port from the listener
	_, portStr, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		return nil, 0, err
	}

	port, err := strconv.Atoi(portStr)
	if err != nil {
		return nil, 0, err
	}

	return listener, uint16(port), nil
}

type TestLivelogServer struct {
	oldRunServer func(server *http.Server, addr, crtFile, keyFile string) error

	putCond   *sync.Cond
	putPort   uint16
	putServer *http.Server

	getCond   *sync.Cond
	getPort   uint16
	getServer *http.Server
}

func StartServer(t *testing.T, tls bool) *TestLivelogServer {
	ts := &TestLivelogServer{
		oldRunServer: runServer,

		putCond:   sync.NewCond(&sync.Mutex{}),
		putPort:   0,
		putServer: nil,

		getCond:   sync.NewCond(&sync.Mutex{}),
		getPort:   0,
		getServer: nil,
	}

	runServer = func(server *http.Server, addr, crtFile, keyFile string) error {
		listener, port, err := listenOnRandomPort()
		if err != nil {
			return err
		}
		if addr == ":getport" {
			ts.getCond.L.Lock()
			if ts.getPort != 0 {
				panic("runServer called more than once!")
			}
			ts.getPort = port
			ts.getServer = server
			ts.getCond.Broadcast()
			ts.getCond.L.Unlock()
		} else if addr == ":putport" {
			ts.putCond.L.Lock()
			if ts.putPort != 0 {
				panic("runServer called more than once!")
			}
			ts.putPort = port
			ts.putServer = server
			ts.putCond.Broadcast()
			ts.putCond.L.Unlock()
		} else {
			panic(fmt.Sprintf("Expected addr :putport or :getport, got %s", addr))
		}
		if crtFile != "" || keyFile != "" {
			return server.ServeTLS(listener, crtFile, keyFile)
		} else {
			return server.Serve(listener)
		}
	}

	// set up some config for the put server
	os.Setenv("ACCESS_TOKEN", "7_3HoMEbQau1Qlzwx-JZgg")
	if tls {
		os.Setenv("SERVER_CRT_FILE", "test/server.crt")
		os.Setenv("SERVER_KEY_FILE", "test/server.key")
	} else {
		os.Unsetenv("SERVER_CRT_FILE")
		os.Unsetenv("SERVER_KEY_FILE")
	}

	go serve(":putport", ":getport")

	return ts
}

func (ts *TestLivelogServer) Close() {
	ts.getCond.L.Lock()
	defer ts.getCond.L.Unlock()
	if ts.getServer != nil {
		ts.getServer.Close()
	}

	ts.putCond.L.Lock()
	defer ts.putCond.L.Unlock()
	if ts.putServer != nil {
		ts.putServer.Close()
	}
}

// Get the port for the PUT server, waiting until it is running
func (ts *TestLivelogServer) PutPort() uint16 {
	ts.putCond.L.Lock()
	defer ts.putCond.L.Unlock()
	for {
		if ts.putPort != 0 {
			break
		}
		ts.putCond.Wait()
	}
	return ts.putPort
}

// Get the port for the GET server, waiting until it is running
func (ts *TestLivelogServer) GetPort() uint16 {
	ts.getCond.L.Lock()
	defer ts.getCond.L.Unlock()
	for {
		if ts.getPort != 0 {
			break
		}
		ts.getCond.Wait()
	}
	return ts.getPort
}
