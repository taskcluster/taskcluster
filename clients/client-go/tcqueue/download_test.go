package tcqueue_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/cenkalti/backoff/v3"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/require"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster/v93/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v93/internal/mocktc"
	"github.com/taskcluster/taskcluster/v93/internal/mocktc/mocks3"
)

type mock struct {
	queueService  *mocktc.Queue
	objectService *mocktc.Object
	s3            *mocks3.S3

	router *mux.Router

	queue *tcqueue.Queue

	srv *httptest.Server
}

func (m *mock) Close() {
	m.srv.Close()
}

func mockTcServices(t *testing.T) mock {
	t.Helper()
	m := mock{}
	m.router = mux.NewRouter().UseEncodedPath()
	m.router.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(404)
		_, _ = w.Write(fmt.Appendf(nil, "URL %v with method %v NOT FOUND\n", req.URL, req.Method))
	})
	m.srv = httptest.NewServer(m.router)

	m.queueService = mocktc.NewQueue(t, m.srv.URL)
	mocktc.NewQueueProvider(m.queueService).RegisterService(m.router)
	m.objectService = mocktc.NewObject(t, m.srv.URL)
	mocktc.NewObjectProvider(m.objectService).RegisterService(m.router)
	m.s3 = mocks3.New(t)
	m.s3.RegisterService(m.router)

	settings := &backoff.ExponentialBackOff{
		InitialInterval:     5 * time.Millisecond,
		RandomizationFactor: 0,
		Multiplier:          100,
		MaxInterval:         60 * time.Second,
		MaxElapsedTime:      100 * time.Millisecond,
		Clock:               backoff.SystemClock,
	}
	settings.Reset()
	m.queue = tcqueue.New(nil, m.srv.URL)
	m.queue.HTTPBackoffClient = &httpbackoff.Client{
		BackOffSettings: settings,
	}

	return m
}

func TestDownloadS3ArtifactToBuf(t *testing.T) {
	m := mockTcServices(t)
	defer m.Close()

	taskId := slugid.Nice()

	m.queueService.FakeS3Artifact(taskId, "0", "some/thing.txt", "text/plain")
	m.s3.FakeObject(fmt.Sprintf("%s/0/%s", taskId, url.PathEscape("some/thing.txt")), "text/plain", []byte("hello, world"))

	buf, contentType, contentLength, err := m.queue.DownloadArtifactToBuf(taskId, 0, "some/thing.txt")
	require.NoError(t, err)
	require.Equal(t, []byte("hello, world"), buf)
	require.Equal(t, "text/plain", contentType)
	require.Equal(t, int64(12), contentLength)
}

func TestDownloadLatestS3ArtifactToFile(t *testing.T) {
	m := mockTcServices(t)
	defer m.Close()

	tempdir, err := os.MkdirTemp("", "client-go-tests-")
	require.NoError(t, err)
	defer os.RemoveAll(tempdir)
	filename := fmt.Sprintf("%s/download.txt", tempdir)

	taskId := slugid.Nice()

	m.queueService.FakeS3Artifact(taskId, "0", "some/thing.txt", "text/plain")
	m.s3.FakeObject(fmt.Sprintf("%s/0/%s", taskId, url.PathEscape("some/thing.txt")), "text/plain", []byte("hello, world"))

	// -1 selects the latest; mocktc defaults latest to 0
	contentType, contentLength, err := m.queue.DownloadArtifactToFile(taskId, -1, "some/thing.txt", filename)
	require.NoError(t, err)
	require.Equal(t, "text/plain", contentType)
	require.Equal(t, int64(12), contentLength)

	file, err := os.ReadFile(filename)
	require.NoError(t, err)
	require.Equal(t, []byte("hello, world"), file)
}

func TestDownloadObjectArtifactToBuf(t *testing.T) {
	m := mockTcServices(t)
	defer m.Close()

	taskId := slugid.Nice()

	m.queueService.FakeObjectArtifact(taskId, "0", "some/thing.txt", "text/plain")
	m.objectService.FakeObject(fmt.Sprintf("t/%s/0/some/thing.txt", taskId), map[string]string{
		"sha256": "09ca7e4eaa6e8ae9c7d261167129184883644d07dfba7cbfbc4c8a2e08360d5b",
	})
	m.s3.FakeObject(fmt.Sprintf("obj/t/%s/0/some/thing.txt", taskId), "text/plain", []byte("hello, world"))

	buf, contentType, contentLength, err := m.queue.DownloadArtifactToBuf(taskId, 0, "some/thing.txt")
	require.NoError(t, err)
	require.Equal(t, []byte("hello, world"), buf)
	require.Equal(t, "text/plain", contentType)
	require.Equal(t, int64(12), contentLength)
}

func TestDownloadErrorArtifactToBuf(t *testing.T) {
	m := mockTcServices(t)
	defer m.Close()

	taskId := slugid.Nice()

	m.queueService.FakeErrorArtifact(taskId, "0", "some/thing.txt", "uhoh", "we are in trouble")

	_, _, _, err := m.queue.DownloadArtifactToBuf(taskId, 0, "some/thing.txt")
	require.Error(t, err)
	// the error message is embedded in a lot of other text, so just look for the required substrings
	require.True(t, strings.Contains(err.Error(), "uhoh"))
	require.True(t, strings.Contains(err.Error(), "we are in trouble"))
}
