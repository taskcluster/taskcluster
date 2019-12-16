package google

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/httpbackoff/v3"
)

type fakeMetadataService struct {
	UserDataError error
	UserData      *UserData
	Metadata      map[string]string
}

func (mds *fakeMetadataService) queryUserData() (*UserData, error) {
	if mds.UserDataError != nil {
		return nil, mds.UserDataError
	}
	return mds.UserData, nil
}

func (mds *fakeMetadataService) queryMetadata(path string) (string, error) {
	if path[0] != '/' {
		panic("path must start with /")
	}
	res, ok := mds.Metadata[path]
	if !ok {
		return "", fmt.Errorf("not found: %s", path)
	}
	return res, nil
}

func TestQueryMetadata(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Metadata-Flavor") != "Google" {
			w.WriteHeader(400)
			fmt.Fprintln(w, "Metadata-Flavor Missing")
		} else if r.URL.Path == "/computeMetadata/v1/id" {
			w.WriteHeader(200)
			fmt.Fprintln(w, "42")
		} else {
			w.WriteHeader(404)
			fmt.Fprintln(w, "Not Found")
		}
	}))
	defer ts.Close()

	metadataBaseURL = ts.URL + "/computeMetadata/v1"
	defer func() {
		metadataBaseURL = "http://metadata.google.internal/computeMetadata/v1"
	}()

	ms := realMetadataService{}

	rv, err := ms.queryMetadata("/id")
	if assert.NoError(t, err) {
		assert.Equal(t, "42\n", rv)
	}

	_, err = ms.queryMetadata("/meta-data/NOSUCH")
	if assert.Error(t, err) {
		httperr, ok := err.(httpbackoff.BadHttpResponseCode)
		assert.True(t, ok)
		assert.Equal(t, 404, httperr.HttpResponseCode)
	}
}

func TestQueryUserData(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Metadata-Flavor") != "Google" {
			w.WriteHeader(400)
			fmt.Fprintln(w, "Metadata-Flavor Missing")
		} else if r.URL.Path == "/computeMetadata/v1/instance/attributes/taskcluster" {
			w.WriteHeader(200)
			fmt.Fprintln(w, `{"workerPoolId": "w/p", "workerConfig": {"from-worker-config": true}}`)
		} else {
			w.WriteHeader(404)
			fmt.Fprintf(w, "Not Found: %s", r.URL.Path)
		}
	}))
	defer ts.Close()

	metadataBaseURL = ts.URL + "/computeMetadata/v1"
	defer func() {
		metadataBaseURL = "http://metadata.google.internal/computeMetadata/v1"
	}()

	ms := realMetadataService{}

	ud, err := ms.queryUserData()
	if assert.NoError(t, err) {
		assert.Equal(t, "w/p", ud.WorkerPoolID)
		assert.Equal(t, json.RawMessage(`{"from-worker-config": true}`), *ud.ProviderWorkerConfig)
	}
}
