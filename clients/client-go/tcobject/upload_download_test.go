package tcobject_test

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/cenkalti/backoff/v3"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v95/clients/client-go/tcobject"
	"github.com/taskcluster/taskcluster/v95/internal/mocktc"
)

func mockObjectServer(t *testing.T) (*httptest.Server, *mux.Router, *tcobject.Object, *mocktc.Object) {
	t.Helper()
	r := mux.NewRouter().UseEncodedPath()
	r.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(404)
		_, _ = w.Write(fmt.Appendf(nil, "URL %v with method %v NOT FOUND\n", req.URL, req.Method))
	})
	srv := httptest.NewServer(r)
	mockobj := mocktc.NewObject(t, srv.URL)
	mocktc.NewObjectProvider(mockobj).RegisterService(r)
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
	return srv, r, object, mockobj
}

// TestGetURLDownloadFails400 tests that when a getUrl download's GET fails
// with a 400 HTTP status code, that a httpbackoff.BadHttpResponseCode error is
// returned and the download isn't (non-intermittent status code).
func TestGetURLDownloadFails400(t *testing.T) {
	srv, r, object, _ := mockObjectServer(t)
	defer srv.Close()

	r.HandleFunc("/s3/obj/some/object",
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
	assert.IsType(t, tcobject.HTTPRetryError{}, err, err)
	assert.IsType(t, httpbackoff.BadHttpResponseCode{}, err.(tcobject.HTTPRetryError).Err)
	assert.Equal(t, 400, err.(tcobject.HTTPRetryError).Err.(httpbackoff.BadHttpResponseCode).HttpResponseCode)
	assert.Equal(t, 1, err.(tcobject.HTTPRetryError).Attempts)
}

// TestGetURLDownloadFailsRetried tests that when a getUrl download's GET fails
// with a 500 HTTP status code, that a httpbackoff.BadHttpResponseCode error is
// returned and the download is retried twice (intermittent status code).
func TestGetURLDownloadFailsRetried(t *testing.T) {
	srv, r, object, _ := mockObjectServer(t)
	defer srv.Close()

	r.HandleFunc("/s3/obj/some/object",
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
	t        *testing.T
	content  []byte
	gzipped  bool
	failures uint8
}

func (th *testHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	th.mu.Lock()
	defer th.mu.Unlock()
	if th.failures > 0 {
		th.failures -= 1
		w.WriteHeader(500)
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	var n int
	var err error
	if th.gzipped {
		require.Equal(th.t, "gzip", r.Header.Get("Accept-Encoding"))
		w.Header().Set("Content-Encoding", "gzip")
		compressor := gzip.NewWriter(w)
		n, err = compressor.Write(th.content)
		if err == nil {
			err = compressor.Close()
		}
	} else {
		n, err = w.Write(th.content)
	}
	if err != nil {
		th.t.Fatal(err)
	}
	if n < len(th.content) {
		th.t.Fatal("incopmlete write")
	}
}

var (
	content = []byte("object data")
)

// TestGetURLDownloadFailsRetrySucceeds tests that when a getUrl download's GET
// fails with a 500 HTTP status code, and then succeeds, that no error is
// returned and the correct object data is returned.
func TestGetURLDownloadFailsRetrySucceeds(t *testing.T) {
	srv, r, object, mockobject := mockObjectServer(t)
	defer srv.Close()

	th := testHandler{t: t, failures: 1, content: content}
	r.Handle("/s3/obj/some/object", &th).Methods("GET")

	_, err := object.CreateUpload("some/object", &tcobject.CreateUploadRequest{})
	assert.NoError(t, err)
	contentHashesMap := map[string]string{
		"sha256": "05c98fa0c442debfec682dc25eb255911264c2f3b0c671c218730da7890ed940",
		"sha512": "87ebe61a26c4a8da246bf965f8d5d1a65f01391f85c2851340d23283ce1db970e2e69e7c328e5604b2e78a2d0be647e72b87e7337d70918d0cb1f65cc81a8987",
	}
	contentHashes, err := json.Marshal(contentHashesMap)
	require.NoError(t, err)
	err = object.FinishUpload("some/object", &tcobject.FinishUploadRequest{Hashes: contentHashes})
	assert.NoError(t, err)
	buf, contentType, contentLength, err := object.DownloadToBuf("some/object")

	require.NoError(t, err)
	assert.Equal(t, content, buf)
	assert.Equal(t, "text/plain", contentType)
	assert.Equal(t, int64(len(content)), contentLength)

	// response from StartDownload expires immediately, so this will have called
	// StartDownload twice
	assert.Less(t, 1, mockobject.StartDownloadCount())
}

// TestGetURLSuccessIdentityEncoding tests a getUrl download with an identity
// encoding.
func TestGetURLSuccessIdentityEncoding(t *testing.T) {
	srv, r, object, _ := mockObjectServer(t)
	defer srv.Close()

	content := []byte("some object data")
	th := testHandler{t: t, gzipped: false, content: content}
	r.Handle("/s3/obj/some/object", &th).Methods("GET")

	_, err := object.CreateUpload("some/object", &tcobject.CreateUploadRequest{})
	assert.NoError(t, err)
	contentHashesMap := map[string]string{
		"sha256": "b763426fc2acc4490490247a756a3fe1c4748f8558cbefa65a5ecf7315b2dee6",
		"sha512": "871eb1e5d438061e164727fec9d68617e32921ffad4756ca493ad31cba2e967a2415a015bf1995a3d355e1f3c098e29cc87b978a2b43484fa27a22e142b2c277",
	}
	contentHashes, err := json.Marshal(contentHashesMap)
	require.NoError(t, err)
	err = object.FinishUpload("some/object", &tcobject.FinishUploadRequest{Hashes: contentHashes})
	assert.NoError(t, err)
	buf, contentType, contentLength, err := object.DownloadToBuf("some/object")

	require.NoError(t, err)
	assert.Equal(t, content, buf)
	assert.Equal(t, "text/plain", contentType)
	assert.Equal(t, int64(len(content)), contentLength)
}

// TestGetURLSuccessGzipEncoding tests a getUrl download with a gzip encoding.
func TestGetURLSuccessGzipEncoding(t *testing.T) {
	srv, r, object, _ := mockObjectServer(t)
	defer srv.Close()

	content := []byte("some object data")
	th := testHandler{t: t, gzipped: true, content: content}
	r.Handle("/s3/obj/some/object", &th).Methods("GET")

	_, err := object.CreateUpload("some/object", &tcobject.CreateUploadRequest{})
	assert.NoError(t, err)
	contentHashesMap := map[string]string{
		"sha256": "b763426fc2acc4490490247a756a3fe1c4748f8558cbefa65a5ecf7315b2dee6",
		"sha512": "871eb1e5d438061e164727fec9d68617e32921ffad4756ca493ad31cba2e967a2415a015bf1995a3d355e1f3c098e29cc87b978a2b43484fa27a22e142b2c277",
	}
	contentHashes, err := json.Marshal(contentHashesMap)
	require.NoError(t, err)
	err = object.FinishUpload("some/object", &tcobject.FinishUploadRequest{Hashes: contentHashes})
	assert.NoError(t, err)
	buf, contentType, contentLength, err := object.DownloadToBuf("some/object")

	require.NoError(t, err)
	assert.Equal(t, content, buf)
	assert.Equal(t, "text/plain", contentType)
	assert.Equal(t, int64(len(content)), contentLength)
}

// TestGetURLNoHashes verifies that when an object has no hashes of acceptable algos,
// the download fails.
func TestGetURLNoHashes(t *testing.T) {
	srv, r, object, _ := mockObjectServer(t)
	defer srv.Close()

	content := []byte("some object data")
	th := testHandler{t: t, gzipped: false, content: content}
	r.Handle("/s3/obj/some/object", &th).Methods("GET")

	_, err := object.CreateUpload("some/object", &tcobject.CreateUploadRequest{})
	assert.NoError(t, err)
	contentHashesMap := map[string]string{
		"md5": "not-acceptable",
	}
	contentHashes, err := json.Marshal(contentHashesMap)
	require.NoError(t, err)
	err = object.FinishUpload("some/object", &tcobject.FinishUploadRequest{Hashes: contentHashes})
	assert.NoError(t, err)

	_, _, _, err = object.DownloadToBuf("some/object")
	assert.Error(t, err)
}

// TestGetURLBadHash verifies that when an object's hash does not match that in the service,
// the download fails.
func TestGetURLBadHash(t *testing.T) {
	srv, r, object, _ := mockObjectServer(t)
	defer srv.Close()

	content := []byte("some object data")
	th := testHandler{t: t, gzipped: false, content: content}
	r.Handle("/s3/obj/some/object", &th).Methods("GET")

	_, err := object.CreateUpload("some/object", &tcobject.CreateUploadRequest{})
	assert.NoError(t, err)
	contentHashesMap := map[string]string{
		"sha256": "9999999999999999999999999999999999999999999999999999999999999999",
		"sha512": "87ebe61a26c4a8da246bf965f8d5d1a65f01391f85c2851340d23283ce1db970e2e69e7c328e5604b2e78a2d0be647e72b87e7337d70918d0cb1f65cc81a8987",
	}
	contentHashes, err := json.Marshal(contentHashesMap)
	require.NoError(t, err)
	err = object.FinishUpload("some/object", &tcobject.FinishUploadRequest{Hashes: contentHashes})
	assert.NoError(t, err)

	_, _, _, err = object.DownloadToBuf("some/object")
	assert.Error(t, err)
}
