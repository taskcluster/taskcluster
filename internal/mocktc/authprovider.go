package mocktc

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v96/internal/mocktc/tc"
)

type AuthProvider struct {
	auth tc.Auth
}

func NewAuthProvider(auth tc.Auth) *AuthProvider {
	return &AuthProvider{
		auth: auth,
	}
}

func (ap *AuthProvider) RegisterService(r *mux.Router) {
	s := r.PathPrefix("/api/auth/v1").Subrouter()
	s.HandleFunc("/scopes/expand", ap.ExpandScopes).Methods("POST")
	s.HandleFunc("/sentry/{project}/dsn", ap.SentryDSN).Methods("GET")
	s.HandleFunc("/websocktunnel/{wstAudience}/{wstClient}", ap.WebsocktunnelToken).Methods("GET")
}

func (ap *AuthProvider) ExpandScopes(w http.ResponseWriter, r *http.Request) {
	var payload tcauth.SetOfScopes
	Marshal(r, &payload)
	out, err := ap.auth.ExpandScopes(&payload)
	JSON(w, out, err)
}

func (ap *AuthProvider) SentryDSN(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := ap.auth.SentryDSN(vars["project"])
	JSON(w, out, err)
}

func (ap *AuthProvider) WebsocktunnelToken(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := ap.auth.WebsocktunnelToken(vars["wstAudience"], vars["wstClient"])
	JSON(w, out, err)
}
