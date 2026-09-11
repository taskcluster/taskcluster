package tcsecrets

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSpacesInRouteParameters(t *testing.T) {
	var capturedURI string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedURI = r.RequestURI
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"secret": {}, "expires": "2099-01-01T00:00:00.000Z"}`))
	}))
	defer server.Close()

	secrets := New(nil, server.URL)
	_, _ = secrets.Get("my secret")

	require.Equal(t, capturedURI, "/api/secrets/v1/secret/my%20secret")
}
