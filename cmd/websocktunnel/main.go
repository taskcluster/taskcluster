package main

import (
	"crypto/tls"
	"encoding/base64"
	"log/syslog"
	"net/http"
	"os"
	"strconv"

	docopt "github.com/docopt/docopt-go"
	"github.com/gorilla/websocket"
	mozlog "github.com/mozilla-services/go-mozlogrus"
	log "github.com/sirupsen/logrus"
	lSyslog "github.com/sirupsen/logrus/hooks/syslog"
	"github.com/taskcluster/websocktunnel/wsproxy"
)

const usage = `Websocketunnel Server

Usage: websocktunnel [-h | --help]

Environment:
 HOSTNAME (required)                         hostname of this service
 PORT (optional; defaults to 80 or 443)      port on which this service is available
 TLS_CERT (optional; no TLS if not provided) base64-encoded TLS certificate
 TLS_KEY                                     corresponding base64-encoded TLS key
 TASKCLUSTER_PROXY_SECRET_A                  JWT secret
 TASKCLUSTER_PROXY_SECRET_B                  alternate JWT secret
 SYSLOG_ADDR                                 address to which to send syslog output
 AUDIENCE                                    JWT 'audience' claim

Options:
-h --help       Show help`

func main() {
	_, _ = docopt.Parse(usage, nil, true, "websocktunnel", false)

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

	// load audience value
	audience := os.Getenv("AUDIENCE")

	portNum, err := strconv.Atoi(port)
	if err != nil {
		panic(err)
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
		Port:       portNum,
		TLS:        useTLS,
		Audience:   audience,
	})

	server := &http.Server{Addr: ":" + port, Handler: proxy}
	defer func() {
		_ = server.Close()
	}()
	logger.WithFields(log.Fields{
		"server-addr": server.Addr,
		"hostname":    hostname,
	}).Info("starting server")

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
