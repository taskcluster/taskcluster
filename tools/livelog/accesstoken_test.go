package main

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// startStream PUTs a small body to the server so that the GET server starts.
func startStream(t *testing.T, ts *TestLivelogServer) {
	t.Helper()
	body := io.NopCloser(strings.NewReader("hi"))
	req, err := http.NewRequest("PUT", fmt.Sprintf("http://127.0.0.1:%d/log", ts.PutPort()), body)
	require.NoError(t, err)
	res, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, 201, res.StatusCode)
}

func getStatus(t *testing.T, ts *TestLivelogServer, path string) int {
	t.Helper()
	res, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d%s", ts.GetPort(), path))
	require.NoError(t, err)
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)
	return res.StatusCode
}

func TestWrongAccessToken(t *testing.T) {
	ts := StartServer(t, false)
	defer ts.Close()
	startStream(t, ts)

	require.Equal(t, 401, getStatus(t, ts, "/log/bad-access-token"))
	require.Equal(t, 401, getStatus(t, ts, "/log/"))
}

func TestCorrectAccessToken(t *testing.T) {
	ts := StartServer(t, false)
	defer ts.Close()
	startStream(t, ts)

	require.Equal(t, 200, getStatus(t, ts, "/log/"+testAccessToken))
}

func TestAccessTokenNotLogged(t *testing.T) {
	var buf bytes.Buffer
	prev := log.Writer()
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(prev) })

	ts := StartServer(t, false)
	defer ts.Close()
	startStream(t, ts)

	require.Equal(t, 200, getStatus(t, ts, "/log/"+testAccessToken))
	require.Equal(t, 401, getStatus(t, ts, "/log/bad-access-token"))

	require.NotContains(t, buf.String(), testAccessToken)
	require.NotContains(t, buf.String(), "bad-access-token")
}
