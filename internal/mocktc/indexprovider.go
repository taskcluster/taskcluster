package mocktc

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/taskcluster/taskcluster/v94/internal/mocktc/tc"
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
}

func (ip *IndexProvider) FindTask(w http.ResponseWriter, r *http.Request) {
	// Not used by any tests currently
}
