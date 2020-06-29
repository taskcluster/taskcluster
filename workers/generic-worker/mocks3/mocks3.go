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
	r.HandleFunc("/s3/{taskId}/{runId}/{name}", s3.Upload).Methods("PUT")
	r.HandleFunc("/s3/{taskId}/{runId}/{name}", s3.Download).Methods("GET")
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
	s3.resources[vars["taskId"]+":"+vars["name"]] = &Resource{
		Content:         content,
		ContentEncoding: contentEncoding,
		ContentType:     contentType,
	}
}

func (s3 *S3) Download(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	a, exists := s3.resources[vars["taskId"]+":"+vars["name"]]
	if !exists {
		w.WriteHeader(404)
		_, _ = fmt.Fprintf(w, "Could not serve artifact with taskId %v and name %v since it does not exist. Here is what is available: %#v", vars["taskId"], vars["name"], s3.resources)
		return
	}
	w.Header().Set("Content-Encoding", a.ContentEncoding)
	w.Header().Set("Content-Type", a.ContentType)
	_, _ = w.Write(a.Content)
}
