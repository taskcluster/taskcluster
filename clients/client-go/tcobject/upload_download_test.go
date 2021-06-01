package tcobject_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/cenkalti/backoff/v3"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v44/clients/client-go/tcobject"
	"github.com/taskcluster/taskcluster/v44/internal/mocktc"
)

func mockObjectServer(t *testing.T) (*httptest.Server, *mux.Router, *tcobject.Object) {
	r := mux.NewRouter().UseEncodedPath()
	r.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(404)
		_, _ = w.Write([]byte(fmt.Sprintf("URL %v with method %v NOT FOUND\n", req.URL, req.Method)))
	})
	srv := httptest.NewServer(r)
	mocktc.NewObjectProvider(mocktc.NewObject(t, srv.URL)).RegisterService(r)
	object := tcobject.New(nil, srv.URL)
	settings := &backoff.ExponentialBackOff{
		InitialInterval:     5 * time.Millisecond,
		RandomizationFactor: 0,
		Multiplier:          100,
		MaxInterval:         60 * time.Second,
		MaxElapsedTime:      100 * time.Millisecond,
		Clock:               backoff.SystemClock,
	}
	settings.Reset()
	object.HTTPBackoffClient = &httpbackoff.Client{
		BackOffSettings: settings,
	}
	return srv, r, object
}

// TestSimpleDownloadFails400 tests that when a simple download's GET fails
// with a 400 HTTP status code, that a httpbackoff.BadHttpResponseCode error is
// returned and the download isn't (non-intermittent status code).
func TestSimpleDownloadFails400(t *testing.T) {
	srv, r, object := mockObjectServer(t)
	defer srv.Close()

	r.HandleFunc("/simple",
		http.HandlerFunc(
			func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(400)
			},
		),
	).Methods("GET")

	_, err := object.CreateUpload("some/object", &tcobject.CreateUploadRequest{})
	assert.NoError(t, err)
	err = object.FinishUpload("some/object", &tcobject.FinishUploadRequest{})
	assert.NoError(t, err)
	_, _, _, err = object.DownloadToBuf("some/object")

	// make sure we got 400 status code for download URL
	assert.IsType(t, tcobject.HTTPRetryError{}, err)
	assert.IsType(t, httpbackoff.BadHttpResponseCode{}, err.(tcobject.HTTPRetryError).Err)
	assert.Equal(t, 400, err.(tcobject.HTTPRetryError).Err.(httpbackoff.BadHttpResponseCode).HttpResponseCode)
	assert.Equal(t, 1, err.(tcobject.HTTPRetryError).Attempts)
}

// TestSimpleDownloadFailsRetried tests that when a simple download's GET fails
// with a 500 HTTP status code, that a httpbackoff.BadHttpResponseCode error is
// returned and the download is retried twice (intermittent status code).
func TestSimpleDownloadFailsRetried(t *testing.T) {
	srv, r, object := mockObjectServer(t)
	defer srv.Close()

	r.HandleFunc("/simple",
		http.HandlerFunc(
			func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(500)
			},
		),
	).Methods("GET")

	_, err := object.CreateUpload("some/object", &tcobject.CreateUploadRequest{})
	assert.NoError(t, err)
	err = object.FinishUpload("some/object", &tcobject.FinishUploadRequest{})
	assert.NoError(t, err)
	_, _, _, err = object.DownloadToBuf("some/object")

	// make sure we get an exception
	assert.IsType(t, tcobject.HTTPRetryError{}, err)
	assert.IsType(t, httpbackoff.BadHttpResponseCode{}, err.(tcobject.HTTPRetryError).Err)
	assert.Equal(t, 500, err.(tcobject.HTTPRetryError).Err.(httpbackoff.BadHttpResponseCode).HttpResponseCode)
	assert.Equal(t, 3, err.(tcobject.HTTPRetryError).Attempts)
}

type testHandler struct {
	mu       sync.Mutex
	attempts uint8
}

func (th *testHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	th.mu.Lock()
	defer th.mu.Unlock()
	switch th.attempts {
	case 0:
		w.WriteHeader(500)
	default:
		_, _ = w.Write([]byte("fake content"))
	}
	th.attempts += 1
}

// TestSimpleDownloadFailsRetrySucceeds tests that when a simple download's GET
// fails with a 500 HTTP status code, and then succeeds, that no error is
// returned and the correct object data is returned.
func TestSimpleDownloadFailsRetrySucceeds(t *testing.T) {
	srv, r, object := mockObjectServer(t)
	defer srv.Close()

	th := testHandler{}
	r.Handle("/simple", &th).Methods("GET")

	_, err := object.CreateUpload("some/object", &tcobject.CreateUploadRequest{})
	assert.NoError(t, err)
	err = object.FinishUpload("some/object", &tcobject.FinishUploadRequest{})
	assert.NoError(t, err)
	_, _, _, err = object.DownloadToBuf("some/object")

	assert.NoError(t, err)
}
