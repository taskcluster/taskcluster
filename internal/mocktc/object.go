package mocktc

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"maps"

	tcclient "github.com/taskcluster/taskcluster/v92/clients/client-go"
	"github.com/taskcluster/taskcluster/v92/clients/client-go/tcobject"
)

type (
	Object struct {
		t *testing.T
		// map from name to object
		objects map[string]Obj
		baseURL string
		// startDownloadCount is the number of
		startDownloadCount int
	}
	Obj struct {
		uploadRequest  *tcobject.CreateUploadRequest
		uploadFinished bool
		// if true, then assume this object is on mocks3; otherwise, serve
		// simple downloads from <baseUrl>/simple
		onMockS3 bool
		hashes   map[string]string
	}
)

/////////////////////////////////////////////////

func (object *Object) CreateUpload(name string, payload *tcobject.CreateUploadRequest) (*tcobject.CreateUploadResponse, error) {
	o := Obj{
		uploadRequest: payload,
	}

	um := tcobject.SelectedUploadMethodOrNone{}
	if payload.ProposedUploadMethods.DataInline.ContentType != "" {
		um.DataInline = true
	} else {
		um.PutURL = tcobject.PutURLUploadResponse{
			Expires: tcclient.Time(time.Now().Add(1 * time.Hour)),
			Headers: map[string]string{"header1": "value1"},
			// return a URL pointing to the mockS3 server
			URL: fmt.Sprintf("%s/s3/obj/%s", object.baseURL, name),
		}
	}

	if payload.Hashes != nil {
		err := json.Unmarshal(payload.Hashes, &o.hashes)
		if err != nil {
			return nil, err
		}
	} else {
		o.hashes = map[string]string{}
	}

	object.objects[name] = o

	return &tcobject.CreateUploadResponse{
		Expires:      payload.Expires,
		ProjectID:    payload.ProjectID,
		UploadID:     payload.UploadID,
		UploadMethod: um,
	}, nil
}

func (object *Object) FinishUpload(name string, payload *tcobject.FinishUploadRequest) error {
	o, exists := object.objects[name]
	if !exists {
		return fmt.Errorf("cannot finish upload for %v (not found)", name)
	}
	o.uploadFinished = true

	if payload.Hashes != nil {
		var newHashes map[string]string
		err := json.Unmarshal(payload.Hashes, &newHashes)
		if err != nil {
			return err
		}

		maps.Copy(o.hashes, newHashes)
	}

	return nil
}

func (object *Object) StartDownload(name string, payload *tcobject.DownloadObjectRequest) (*tcobject.DownloadObjectResponse, error) {
	object.startDownloadCount++
	o, exists := object.objects[name]
	if !exists {
		return nil, fmt.Errorf("cannot start download for upload ID %v (not found)", name)
	}

	hashesJson, _ := json.Marshal(o.hashes)

	var err error
	var dor tcobject.DownloadObjectResponse
	var resp any
	switch {
	case payload.AcceptDownloadMethods.Simple:
		if o.onMockS3 {
			resp = tcobject.SimpleDownloadResponse{
				Method: "simple",
				// return a URL pointing to the mockS3 server
				URL: fmt.Sprintf("%s/s3/%s", object.baseURL, name),
			}
		} else {
			resp = tcobject.SimpleDownloadResponse{
				Method: "simple",
				URL:    object.baseURL + "/simple",
			}
		}
	case payload.AcceptDownloadMethods.GetURL:
		resp = tcobject.GetURLDownloadResponse{
			Method: "getUrl",
			// return a URL pointing to the mockS3 server
			URL:     fmt.Sprintf("%s/s3/obj/%s", object.baseURL, name),
			Expires: tcclient.Time(time.Now()), // expires immediately, resulting in multiple calls (expected)
			Hashes:  hashesJson,
		}
	}
	dor, err = json.Marshal(resp)
	if err != nil {
		object.t.Fatalf("Error marshalling into json: %v", err)
	}
	return &dor, nil
}

func (object *Object) UploadFromFile(projectID string, name string, contentType string, expires time.Time, uploadID string, filepath string) error {
	// this isn't an API method, so this is never actually called, but must be
	// here to implement the tc.Object interface
	panic("never actually called")
}

/////////////////////////////////////////////////

// FakeS3Object creates a fake object which is assumed to be stored in mocks3
// at an object of the same name.  It is up to the caller to create the object
// in mocks3 if necesary.
func (object *Object) FakeObject(name string, hashes map[string]string) {
	object.objects[name] = Obj{
		uploadRequest:  &tcobject.CreateUploadRequest{},
		uploadFinished: true,
		onMockS3:       true,
		hashes:         hashes,
	}
}

// StartDownloadCount returns the number of times StartDownload has been called
func (object *Object) StartDownloadCount() int {
	return object.startDownloadCount
}

/////////////////////////////////////////////////

func NewObject(t *testing.T, baseURL string) *Object {
	t.Helper()
	o := &Object{
		t:       t,
		objects: map[string]Obj{},
		baseURL: baseURL,
	}
	return o
}
