package client

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
	"time"

	log "github.com/sirupsen/logrus"

	"github.com/dgrijalva/jwt-go"
	"github.com/gorilla/websocket"
	"github.com/taskcluster/websocktunnel/util"
)

func testConfigurer(id, addr string, retryConfig RetryConfig, logger *log.Logger) Configurer {
	now := time.Now()
	expires := now.Add(30 * 24 * time.Hour)

	token := jwt.New(jwt.SigningMethodHS256)

	token.Claims.(jwt.MapClaims)["nbf"] = now.Unix() - 300 // 5 minutes
	token.Claims.(jwt.MapClaims)["iss"] = "taskcluster-auth"
	token.Claims.(jwt.MapClaims)["exp"] = expires.Unix()
	token.Claims.(jwt.MapClaims)["tid"] = id

	tokString, _ := token.SignedString([]byte("test-secret"))

	return func() (Config, error) {
		conf := Config{
			ID:         id,
			TunnelAddr: addr,
			Token:      tokString,
			Logger:     logger,
			Retry:      retryConfig,
		}
		return conf, nil
	}

}

func genLogger() *log.Logger {
	logger := &log.Logger{
		Out:       os.Stdout,
		Formatter: new(log.TextFormatter),
		Level:     log.DebugLevel,
	}
	return logger
}

var upgrader = websocket.Upgrader{}

// Checks if connection tries until max elapsed time and counts retries
func TestExponentialBackoffSuccess(t *testing.T) {
	// no race condition here so no mutex needed
	count := 0
	failCount := 3
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if websocket.IsWebSocketUpgrade(r) {
			if count < failCount {
				count++
				http.Error(w, http.StatusText(500), 500)
				return
			}
			_, _ = upgrader.Upgrade(w, r, nil)
		}
	})
	server := httptest.NewServer(handler)
	defer server.Close()

	tunnelAddr := util.MakeWsURL(server.URL)
	_, err := New(testConfigurer("workerID", tunnelAddr, RetryConfig{}, genLogger()))
	if err != nil {
		t.Fatal(err)
	}
	if count != failCount {
		t.Fatalf("not enough retries")
	}
}

// Checks if reconnect runs for MaxElapsedTime and then fails
func TestExponentialBackoffFailure(t *testing.T) {
	count := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, http.StatusText(500), 500)
		count++
	}))
	defer server.Close()

	retry := RetryConfig{
		InitialDelay:   200 * time.Millisecond,
		MaxElapsedTime: 2 * time.Second,
	}

	tunnelAddr := util.MakeWsURL(server.URL)
	start := time.Now()
	_, err := New(testConfigurer("workerID", tunnelAddr, retry, genLogger()))
	end := time.Now()

	if err.(Error) != ErrRetryTimedOut {
		t.Fatalf("should fail with %v. Instead failed with %v", ErrRetryTimedOut, err)
	}

	if end.Sub(start) < 2*time.Second {
		t.Fatalf("should run for atleast %d milliseconds", retry.MaxElapsedTime)
	}

	// maximum time accounting for jitter
	maxTime := retry.MaxElapsedTime + 200*time.Millisecond
	if end.Sub(start) > maxTime {
		t.Fatalf("should not run for more than %d milliseconds", maxTime)
	}

	if count > 10 || count < 4 {
		t.Fatalf("wrong number of retries: %d", count)
	}
}

// Ensure that client does not retry if error is 4xx
func TestRetryStops4xx(t *testing.T) {
	tryCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tryCount++
		if websocket.IsWebSocketUpgrade(r) && tryCount == 1 {
			http.Error(w, http.StatusText(500), 500)
			return
		}
		http.Error(w, http.StatusText(400), 400)
	}))
	defer server.Close()

	tunnelAddr := util.MakeWsURL(server.URL)
	_, err := New(testConfigurer("workerID", tunnelAddr, RetryConfig{}, genLogger()))

	// attempt to connect with retry
	if err.(Error) != ErrRetryFailed {
		t.Fatalf("should fail with error: %v\nInstead failed with error: %v", ErrRetryFailed, err)
	}
	if tryCount != 2 {
		t.Fatal("only 2 connection attempts should occur")
	}
}

// Ensure token gets generated
func TestAuthorizer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		now := time.Now().Unix()

		tokenString := util.ExtractJWT(r.Header.Get("Authorization"))
		if tokenString == "" {
			http.Error(w, http.StatusText(500), 500)
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return []byte("test-secret"), nil
		})

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, http.StatusText(500), 500)
			return
		}

		if claims["tid"] != "workerID" {
			http.Error(w, http.StatusText(500), 500)
			return
		}

		if !claims.VerifyExpiresAt(now, true) {
			http.Error(w, http.StatusText(500), 500)
			return
		}

		if !claims.VerifyNotBefore(now, true) {
			http.Error(w, http.StatusText(500), 500)
			return
		}

		if err != nil {
			http.Error(w, http.StatusText(500), 500)
			return
		}

		_, _ = upgrader.Upgrade(w, r, nil)
	}))
	defer server.Close()

	tunnelAddr := util.MakeWsURL(server.URL)
	_, err := New(testConfigurer("workerID", tunnelAddr, RetryConfig{}, genLogger()))

	if err != nil {
		t.Fatal(err)
	}
}

func TestClientReconnect(t *testing.T) {
	tryCount := int32(3)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.LoadInt32(&tryCount) == 0 {
			http.Error(w, http.StatusText(400), 400)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatal(err)
		}

		time.Sleep(800 * time.Millisecond)
		atomic.AddInt32(&tryCount, -1)

		_ = conn.Close()
	}))

	tunnelAddr := util.MakeWsURL(server.URL)
	client, err := New(testConfigurer("workerID", tunnelAddr, RetryConfig{}, genLogger()))
	if err != nil {
		t.Fatal(err)
	}

	// nil server
	srv := &http.Server{}
	done := make(chan bool, 1)

	go func() {
		err = srv.Serve(client)
		close(done)
	}()

	select {
	case <-done:
		if err.(Error) != ErrRetryFailed {
			t.Fatalf("error should be: %v\nInstead found: %v", ErrRetryFailed, err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("test timed out")
	}

}
