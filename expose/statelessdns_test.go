package expose

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"io/ioutil"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/stateless-dns-go/hostname"
)

// domain for testing; note that this is not actually configured
var hostDomain = "stateless-dns.example.com"
var secret = "sshhh!"

func makeStatelessDNSExposer(t *testing.T) Exposer {
	exposer, err := NewStatelessDNS(
		net.ParseIP("127.0.0.1"),
		0,
		hostDomain,
		secret,
		time.Minute,
		localhostCert,
		localhostKey,
	)
	if err != nil {
		t.Fatalf("Constructor returned an error: %v", err)
	}
	return exposer
}

// Test exposing an HTTP server via stateless-dns
func TestStatelessDNSExposeHTTP(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello, world")
	}))
	defer ts.Close()

	testURL, _ := url.Parse(ts.URL)
	_, testPortStr, _ := net.SplitHostPort(testURL.Host)
	testPort, _ := strconv.Atoi(testPortStr)

	exposer := makeStatelessDNSExposer(t)
	exposure, err := exposer.ExposeHTTP(uint16(testPort))
	if err != nil {
		t.Fatalf("ExposeHTTP returned an error: %v", err)
	}
	defer exposure.Close()

	gotURL := exposure.GetURL()
	host, port, _ := net.SplitHostPort(gotURL.Host)
	assert.Equal(t, "https", gotURL.Scheme, "Should return URL with correct scheme")
	assert.NotEqual(t, testPortStr, port, "Should return URL with a random port")

	ip, expires, _, err := hostname.Decode(host, secret, hostDomain)
	if err != nil {
		t.Fatalf("Could not decode hostname: %s", err)
	}
	assert.Equal(t, net.ParseIP("127.0.0.1"), ip, "Decoded hostname points to localhost IP")
	assert.WithinDuration(t, time.Now().Add(time.Minute), expires, 10*time.Second, "Decoded expiration is ok")

	// reset the URL to 127.0.0.1, since the example.com DNS doesn't actually exist,
	// and since that's what the TLS certificate is for.
	gotURL.Host = fmt.Sprintf("127.0.0.1:%s", port)

	certPool := x509.NewCertPool()
	certPool.AppendCertsFromPEM([]byte(localhostCert))
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				RootCAs: certPool,
			},
		},
	}

	res, err := client.Get(gotURL.String())
	if err != nil {
		t.Fatal(err)
	}
	assert.Equal(t, 200, res.StatusCode, "got 200 response via proxy")

	greeting, err := ioutil.ReadAll(res.Body)
	res.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	assert.Equal(t, "Hello, world", string(greeting), "got greeting via proxy")
}

// Test exposing a TCP port via stateless-dns
func TestStatelessDNSExposePort(t *testing.T) {
	// set up a TCP echo server on a random port
	tcpListener, tcpListenerPort, err := listenOnRandomPort()
	if err != nil {
		t.Fatalf("listenOnRandomPort: %s", err)
	}
	defer tcpListener.Close()

	// run a tcp echo server on that listener
	go func() {
		stream, err := tcpListener.Accept()
		if err != nil {
			t.Logf("err accepting: %s", err)
			return
		}

		io.Copy(stream, stream)
		_ = stream.Close()
	}()

	exposer := makeStatelessDNSExposer(t)
	exposure, err := exposer.ExposeTCPPort(uint16(tcpListenerPort))
	if err != nil {
		t.Fatalf("ExposeTCPPort returned an error: %v", err)
	}
	defer exposure.Close()

	gotURL := exposure.GetURL()
	host, port, _ := net.SplitHostPort(gotURL.Host)
	assert.Equal(t, "wss", gotURL.Scheme, "Should return URL with correct scheme")

	ip, expires, _, err := hostname.Decode(host, secret, hostDomain)
	if err != nil {
		t.Fatalf("Could not decode hostname: %s", err)
	}
	assert.Equal(t, net.ParseIP("127.0.0.1"), ip, "Decoded hostname points to localhost IP")
	assert.WithinDuration(t, time.Now().Add(time.Minute), expires, 10*time.Second, "Decoded expiration is ok")

	// reset the URL to 127.0.0.1, since the example.com DNS doesn't actually exist,
	// and since that's what the TLS certificate is for.
	gotURL.Host = fmt.Sprintf("127.0.0.1:%s", port)

	certPool := x509.NewCertPool()
	certPool.AppendCertsFromPEM([]byte(localhostCert))
	tlsConfig := &tls.Config{
		RootCAs: certPool,
	}
	dialer := websocket.Dialer{
		TLSClientConfig: tlsConfig,
	}
	ws, _, err := dialer.Dial(gotURL.String(), nil)

	if err != nil {
		t.Fatalf("Dial: %s", err)
	}

	err = ws.WriteMessage(websocket.BinaryMessage, []byte("Hello"))
	if err != nil {
		t.Fatalf("WriteMessage: %s", err)
	}

	messageType, payload, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("ReadMessage: %s", err)
	}

	assert.Equal(t, websocket.BinaryMessage, messageType, "got expected message type back")
	assert.Equal(t, []byte("Hello"), payload, "got expected message back")
}
