package model

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"strings"
)

// jsonschema2go requires that schemas be at URLs, but our data is in-memory,
// so we set up a local http server and then generate URLs on that server.  The
// server serves the files defined in the generated references

var referencesServer *httptest.Server
var references ReferencesFile

type ReferencesFile []ReferencesFileEntry
type ReferencesFileEntry struct {
	Content  json.RawMessage `json:"content"`
	Filename string          `json:"filename"`
}

func StartReferencesServer() error {
	if referencesServer != nil {
		return nil
	}

	file, err := ioutil.ReadFile("../../../../generated/references.json")
	if err != nil {
		return err
	}

	err = json.Unmarshal([]byte(file), &references)
	if err != nil {
		return err
	}

	referencesServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path[1:]
		raw := ReferencesServerGet(path)
		if raw != nil {
			enc := json.NewEncoder(w)
			enc.Encode(*raw)
			return
		}
		http.NotFound(w, r)
	}))

	// for all schemas, update $id to a full URL otherwise JSON tools get upsot
	for i, ref := range references {
		if !strings.HasPrefix(ref.Filename, "schemas/") {
			continue
		}

		var x map[string]interface{}
		err := json.Unmarshal(ref.Content, &x)
		if err != nil {
			panic(err)
		}
		x["$id"] = interface{}(referencesServer.URL + x["$id"].(string))
		ref.Content, err = json.Marshal(&x)
		if err != nil {
			panic(err)
		}
		references[i] = ref
	}

	return nil
}

func ReferencesServerGet(path string) *json.RawMessage {
	if path[:1] == "/" {
		path = path[1:]
	}
	for _, entry := range references {
		if entry.Filename == path {
			return &entry.Content
		}
	}
	return nil
}

func ReferencesServerUrl(path string) string {
	if referencesServer == nil {
		panic("schema server not started")
	}

	sep := ""
	if path[:1] != "/" {
		sep = "/"
	}
	return referencesServer.URL + sep + path
}
