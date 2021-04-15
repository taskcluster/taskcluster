package mocks3

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"testing"

	"github.com/gorilla/mux"
)

type Resource struct {
	Content         []byte
	ContentEncoding string
	ContentType     string
}

type S3 struct {
	t         *testing.T
	resources map[string]*Resource
}

func (s3 *S3) RegisterService(r *mux.Router) {
	r.HandleFunc("/s3/{name:.*}", s3.Upload).Methods("PUT")
	r.HandleFunc("/s3/{name:.*}", s3.Download).Methods("GET")
}

func New(t *testing.T) *S3 {
	return &S3{
		t:         t,
		resources: map[string]*Resource{},
	}
}

func (s3 *S3) Upload(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	contentEncoding := r.Header.Get("Content-Encoding")
	contentType := r.Header.Get("Content-Type")
	content, err := ioutil.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(400)
	}
	s3.resources[vars["name"]] = &Resource{
		Content:         content,
		ContentEncoding: contentEncoding,
		ContentType:     contentType,
	}
}

func (s3 *S3) Download(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	a, exists := s3.resources[vars["name"]]
	if !exists {
		w.WriteHeader(404)
		_, _ = fmt.Fprintf(w, "Could not serve object named %v since it does not exist. Here is what is available: %#v", vars["name"], s3.resources)
		return
	}
	w.Header().Set("Content-Encoding", a.ContentEncoding)
	w.Header().Set("Content-Type", a.ContentType)
	_, _ = w.Write(a.Content)
}

/////////////////////////

// FakeObject makes a fake S3 object outside of the usual API flow.  Note that
// mocktc creates object names on the form "/taskId/runId/name" for s3 artifacts, and that
// name is escaped with url.PathEscape.
func (s3 *S3) FakeObject(name string, contentType string, content []byte) {
	s3.resources[name] = &Resource{
		Content:         content,
		ContentEncoding: "identity",
		ContentType:     contentType,
	}
}
