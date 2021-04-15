package mocktc

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v43/clients/client-go"
	"github.com/taskcluster/taskcluster/v43/clients/client-go/tcobject"
)

type (
	Object struct {
		t *testing.T
		// map from name to object
		objects map[string]Obj
		baseURL string
	}
	Obj struct {
		uploadRequest  *tcobject.CreateUploadRequest
		uploadFinished bool
		// if true, then assume this object is on mocks3; otherwise, serve
		// simple downloads from <baseUrl>/simple
		onMockS3 bool
	}
)

/////////////////////////////////////////////////

func (object *Object) CreateUpload(name string, payload *tcobject.CreateUploadRequest) (*tcobject.CreateUploadResponse, error) {
	object.objects[name] = Obj{
		uploadRequest: payload,
	}
	return &tcobject.CreateUploadResponse{
		Expires:   payload.Expires,
		ProjectID: payload.ProjectID,
		UploadID:  payload.UploadID,
		UploadMethod: tcobject.SelectedUploadMethodOrNone{
			DataInline: payload.ProposedUploadMethods.DataInline.ContentType != "",
			PutURL: tcobject.PutURLUploadResponse{
				Expires: tcclient.Time(time.Now().Add(1 * time.Hour)),
				Headers: map[string]string{"header1": "value1"},
				URL:     object.baseURL + "/upload",
			},
		},
	}, nil
}

func (object *Object) FinishUpload(name string, payload *tcobject.FinishUploadRequest) error {
	o, exists := object.objects[name]
	if !exists {
		return fmt.Errorf("Cannot finish upload for %v (not found)", name)
	}
	o.uploadFinished = true
	return nil
}

func (object *Object) StartDownload(name string, payload *tcobject.DownloadObjectRequest) (*tcobject.DownloadObjectResponse, error) {
	o, exists := object.objects[name]
	if !exists {
		return nil, fmt.Errorf("Cannot start download for upload ID %v (not found)", name)
	}
	var err error
	var dor tcobject.DownloadObjectResponse
	var resp interface{}
	switch {
	case payload.AcceptDownloadMethods.HTTPGET:
		resp = tcobject.HTTPGETDownloadResponse{
			Method: "simple",
			Details: tcobject.Details{
				URL: object.baseURL + "/HTTPGET",
			},
		}
	case payload.AcceptDownloadMethods.Simple:
		if o.onMockS3 {
			resp = tcobject.SimpleDownloadResponse{
				Method: "simple",
				URL:    fmt.Sprintf("%s/s3/%s", object.baseURL, name),
			}
		} else {
			resp = tcobject.SimpleDownloadResponse{
				Method: "simple",
				URL:    object.baseURL + "/simple",
			}
		}
	}
	dor, err = json.Marshal(resp)
	if err != nil {
		object.t.Fatalf("Error marshalling into json: %v", err)
	}
	return &dor, nil
}

/////////////////////////////////////////////////

// FakeS3Object creates a fake object which is assumed to be stored in mocks3
// at an object of the same name.  It is up to the caller to create the object
// in mocks3 if necesary.
func (object *Object) FakeObject(name string) {
	object.objects[name] = Obj{
		uploadRequest:  &tcobject.CreateUploadRequest{},
		uploadFinished: true,
		onMockS3:       true,
	}
}

/////////////////////////////////////////////////

func NewObject(t *testing.T, baseURL string) *Object {
	o := &Object{
		t:       t,
		objects: map[string]Obj{},
		baseURL: baseURL,
	}
	return o
}
