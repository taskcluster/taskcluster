// +build !go1.7
// +build !go1.8
// +build !go1.9
// +build go1.10
// +build !go1.11
// +build !go1.12

package main

import (
	"crypto/tls"
	"encoding/base64"
	"log/syslog"
	"net/http"
	"os"

	log "github.com/sirupsen/logrus"
	lSyslog "github.com/sirupsen/logrus/hooks/syslog"

	"github.com/gorilla/websocket"
	mozlog "github.com/mozilla-services/go-mozlogrus"
	"github.com/taskcluster/websocktunnel/wsproxy"
)

// starts websocktunnel on a random port on the system
func main() {
	// Load required env variables
	// Load Hostname
	hostname := os.Getenv("HOSTNAME")
	if hostname == "" {
		panic("hostname required")
	}

	logger := log.New()

	if env := os.Getenv("ENV"); env == "production" {
		// add mozlog formatter
		logger.Formatter = &mozlog.MozLogFormatter{
			LoggerName: "websocktunnel",
		}

		// add syslog hook if addr is provided
		syslogAddr := os.Getenv("SYSLOG_ADDR")
		if syslogAddr != "" {
			hook, err := lSyslog.NewSyslogHook("udp", syslogAddr, syslog.LOG_DEBUG, "websocktunnel")
			if err != nil {
				panic(err)
			}
			logger.Hooks.Add(hook)
		}
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
		logger.Error(err.Error())
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

	// will panic if secrets are not loaded
	proxy, _ := wsproxy.New(wsproxy.Config{
		Logger:     logger,
		Upgrader:   upgrader,
		JWTSecretA: []byte(signingSecretA),
		JWTSecretB: []byte(signingSecretB),
		Domain:     hostname,
		TLS:        useTLS,
	})

	// TODO: Read TLS config
	server := &http.Server{Addr: ":" + port, Handler: proxy}
	defer func() {
		_ = server.Close()
	}()
	logger.WithFields(log.Fields{
		"server-addr": server.Addr,
		"hostname":    hostname,
	}).Infof("starting server")

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
		err = server.ListenAndServe()
		if err != nil {
			panic(err)
		}
	}
}
