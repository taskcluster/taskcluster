package expose

import (
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestConstructor(t *testing.T) {
	exposer, err := NewLocal(net.ParseIP("127.0.0.1"))
	if err != nil {
		t.Fatalf("Constructor returned an error: %v", err)
	}
	if exposer == nil {
		t.Fatalf("Constructor did not return a value")
	}
}

func makeLocalExposer(t *testing.T) Exposer {
	exposer, err := NewLocal(net.ParseIP("127.0.0.1"))
	if err != nil {
		t.Fatalf("Constructor returned an error: %v", err)
	}
	return exposer
}

func TestLocalExposeHTTP(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello, world")
	}))
	defer ts.Close()

	testURL, _ := url.Parse(ts.URL)
	_, testPortStr, _ := net.SplitHostPort(testURL.Host)
	testPort, _ := strconv.Atoi(testPortStr)

	exposer := makeLocalExposer(t)
	exposure, err := exposer.ExposeHTTP(uint16(testPort))
	if err != nil {
		t.Fatalf("ExposeHTTP returned an error: %v", err)
	}
	defer exposure.Close()

	gotURL := exposure.GetURL()
	host, port, _ := net.SplitHostPort(gotURL.Host)
	assert.Equal(t, "http", gotURL.Scheme, "Should return URL with correct scheme")
	assert.Equal(t, "127.0.0.1", host, "Should return URL with correct host")
	assert.NotEqual(t, testPortStr, port, "Should return URL with a random port")

	res, err := http.Get(gotURL.String())
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
