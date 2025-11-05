package mocktc

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/taskcluster/taskcluster/v92/clients/client-go/tcobject"
	"github.com/taskcluster/taskcluster/v92/internal/mocktc/tc"
)

type ObjectProvider struct {
	object tc.Object
}

func NewObjectProvider(object tc.Object) *ObjectProvider {
	return &ObjectProvider{
		object: object,
	}
}

func (op *ObjectProvider) RegisterService(r *mux.Router) {
	s := r.PathPrefix("/api/object/v1").Subrouter()
	s.HandleFunc("/upload/{name}", op.CreateUpload).Methods("PUT")
	s.HandleFunc("/finish-upload/{name}", op.FinishUpload).Methods("POST")
	s.HandleFunc("/start-download/{name}", op.StartDownload).Methods("PUT")
}

func (op *ObjectProvider) CreateUpload(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcobject.CreateUploadRequest
	Marshal(r, &payload)
	out, err := op.object.CreateUpload(vars["name"], &payload)
	JSON(w, out, err)
}

func (op *ObjectProvider) FinishUpload(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcobject.FinishUploadRequest
	Marshal(r, &payload)
	NoBody(w, op.object.FinishUpload(vars["name"], &payload))
}

func (op *ObjectProvider) StartDownload(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcobject.DownloadObjectRequest
	Marshal(r, &payload)
	out, err := op.object.StartDownload(vars["name"], &payload)
	JSON(w, out, err)
}
