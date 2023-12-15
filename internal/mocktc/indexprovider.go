package mocktc

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/taskcluster/taskcluster/v59/clients/client-go/tcindex"
	"github.com/taskcluster/taskcluster/v59/internal/mocktc/tc"
)

type IndexProvider struct {
	index tc.Index
}

func NewIndexProvider(index tc.Index) *IndexProvider {
	return &IndexProvider{
		index: index,
	}
}

func (ip *IndexProvider) RegisterService(r *mux.Router) {
	s := r.PathPrefix("/api/index/v1").Subrouter()
	s.HandleFunc("/task/{indexPath}", ip.FindTask).Methods("GET")
	s.HandleFunc("/task/{indexPath}", ip.InsertTask).Methods("PUT")
}

func (ip *IndexProvider) FindTask(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := ip.index.FindTask(vars["indexPath"])
	JSON(w, out, err)
}

func (ip *IndexProvider) InsertTask(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcindex.InsertTaskRequest
	Marshal(r, &payload)
	out, err := ip.index.InsertTask(vars["indexPath"], &payload)
	JSON(w, out, err)
}
