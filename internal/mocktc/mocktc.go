package mocktc

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/gorilla/mux"
	"github.com/taskcluster/httpbackoff/v3"
	tcclient "github.com/taskcluster/taskcluster/v92/clients/client-go"
	"github.com/taskcluster/taskcluster/v92/internal/httputil"
	"github.com/taskcluster/taskcluster/v92/internal/mocktc/mocks3"
)

func Vars(r *http.Request) map[string]string {
	encodedVars := mux.Vars(r)
	decodedVars := make(map[string]string, len(encodedVars))
	var err error
	for i, j := range encodedVars {
		decodedVars[i], err = url.QueryUnescape(j)
		if err != nil {
			panic(err)
		}
	}
	return decodedVars
}

func WriteAsJSON(t *testing.T, w http.ResponseWriter, resp any) {
	t.Helper()
	bytes, err := json.MarshalIndent(resp, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	_, err = w.Write(bytes)
	if err != nil {
		t.Fatal(err)
	}
}

func JSON(w http.ResponseWriter, resp any, err error) {
	if err != nil {
		ReportError(w, err)
		return
	}
	bytes, err := json.MarshalIndent(resp, "", "  ")
	if err != nil {
		panic(err)
	}
	_, err = w.Write(bytes)
	if err != nil {
		panic(err)
	}
}

func ReportError(w http.ResponseWriter, err error) {
	switch e := err.(type) {
	case *tcclient.APICallException:
		switch f := e.RootCause.(type) {
		case httpbackoff.BadHttpResponseCode:
			w.WriteHeader(f.HttpResponseCode)
		default:
			w.WriteHeader(400)
		}
	default:
		w.WriteHeader(400)
	}
	_, err = w.Write([]byte(err.Error()))
	if err != nil {
		panic(err)
	}
}

func NoBody(w http.ResponseWriter, err error) {
	if err != nil {
		ReportError(w, err)
		return
	}
	w.WriteHeader(200)
}

func Marshal(req *http.Request, payload any) {
	dec := json.NewDecoder(req.Body)
	dec.DisallowUnknownFields()
	err := dec.Decode(payload)
	if err != nil {
		panic(err)
	}
}

func ServiceProviders(t *testing.T, baseURL string) []httputil.ServiceProvider {
	t.Helper()
	return []httputil.ServiceProvider{
		NewAuthProvider(NewAuth(t)),
		NewIndexProvider(NewIndex(t)),
		NewQueueProvider(NewQueue(t, baseURL)),
		NewSecretsProvider(NewSecrets()),
		NewWorkerManagerProvider(NewWorkerManager(t)),
		mocks3.New(t),
		NewObjectProvider(NewObject(t, baseURL)),
	}
}
