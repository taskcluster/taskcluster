package main

import (
	"crypto/tls"
	"encoding/base64"
	log "github.com/sirupsen/logrus"
	"net/http"
	"os"

	"github.com/gorilla/websocket"
	"github.com/taskcluster/webhooktunnel/whproxy"
)

var logger = &log.Logger{
	Out:       os.Stdout,
	Formatter: new(log.TextFormatter),
	Level:     log.DebugLevel,
}

// starts proxy on a random port on the system
func main() {
	// Load required env variables
	// Load Hostname
	hostname := os.Getenv("HOSTNAME")
	if hostname == "" {
		panic("hostname required")
	}

	// Load secrets
	signingSecretA := os.Getenv("TASKCLUSTER_PROXY_SECRET_A")
	signingSecretB := os.Getenv("TASKCLUSTER_PROXY_SECRET_B")

	// Load TLS certificates
	useTLS := true
	tlsKeyEnc := os.Getenv("TLS_KEY")
	tlsCertEnc := os.Getenv("TLS_CERTIFICATE")

	tlsKey, _ := base64.StdEncoding.DecodeString(tlsKeyEnc)
	tlsCert, _ := base64.StdEncoding.DecodeString(tlsCertEnc)
	cert, err := tls.X509KeyPair([]byte(tlsCert), []byte(tlsKey))
	if err != nil {
		logger.Printf("tls error: %v", err)
		useTLS = false
	}

	//load port
	port := os.Getenv("PORT")
	if port == "" {
		if useTLS {
			port = "443"
		} else {
			port = "80"
		}
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	proxy, _ := whproxy.New(whproxy.Config{
		Logger:     logger,
		Upgrader:   upgrader,
		JWTSecretA: []byte(signingSecretA),
		JWTSecretB: []byte(signingSecretB),
		Domain:     hostname,
	})

	// TODO: Read TLS config
	server := &http.Server{Addr: ":" + port, Handler: proxy}
	defer func() {
		_ = server.Close()
	}()
	logger.Printf("starting server on %s", server.Addr)

	// create tls config and serve
	if useTLS {
		config := &tls.Config{
			Certificates: []tls.Certificate{cert},
		}
		config.BuildNameToCertificate()
		listener, err := tls.Listen("tcp", ":"+port, config)
		if err != nil {
			panic(err)
		}
		_ = server.Serve(listener)
	} else {
		_ = server.ListenAndServe()
	}
}
