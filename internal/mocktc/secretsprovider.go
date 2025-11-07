package mocktc

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/taskcluster/taskcluster/v93/clients/client-go/tcsecrets"
	"github.com/taskcluster/taskcluster/v93/internal/mocktc/tc"
)

type SecretsProvider struct {
	secrets tc.Secrets
}

func NewSecretsProvider(secrets tc.Secrets) *SecretsProvider {
	return &SecretsProvider{
		secrets: secrets,
	}
}

func (sp *SecretsProvider) RegisterService(r *mux.Router) {
	s := r.PathPrefix("/api/secrets/v1").Subrouter()
	s.HandleFunc("/ping", sp.Ping).Methods("GET")
	s.HandleFunc("/secret/{name}", sp.Set).Methods("PUT")
	s.HandleFunc("/secret/{name}", sp.Remove).Methods("DELETE")
	s.HandleFunc("/secret/{name}", sp.Get).Methods("GET")
	s.HandleFunc("/secrets", sp.List).Methods("GET").Queries("continuationToken", "{continuationToken}", "limit", "{limit}")
}

func (sp *SecretsProvider) Ping(w http.ResponseWriter, r *http.Request) {
	NoBody(w, sp.secrets.Ping())
}

func (sp *SecretsProvider) Set(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcsecrets.Secret
	Marshal(r, &payload)
	NoBody(w, sp.secrets.Set(vars["name"], &payload))
}

func (sp *SecretsProvider) Remove(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	NoBody(w, sp.secrets.Remove(vars["name"]))
}

func (sp *SecretsProvider) Get(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := sp.secrets.Get(vars["name"])
	JSON(w, out, err)
}

func (sp *SecretsProvider) List(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := sp.secrets.List(vars["continuationToken"], vars["limit"])
	JSON(w, out, err)
}
