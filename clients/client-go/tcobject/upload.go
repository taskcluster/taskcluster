package tcobject

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"time"

	"github.com/cenkalti/backoff/v3"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/v42/clients/client-go"
)

const (
	DataInlineMaxSize = 8192
)

// UploadFromBuf is a convenience method to publish an Object to the Object
// Service with content buf and given projectID, name, contentType and expires.
func (object *Object) UploadFromBuf(projectID string, name string, contentType string, expires time.Time, buf []byte) (err error) {
	readSeeker := bytes.NewReader(buf)
	contentLength := int64(len(buf))
	return object.UploadFromReadSeeker(projectID, name, contentType, contentLength, expires, readSeeker)
}

// UploadFromFile is a convenience method to publish an Object to the Object
// Server from file with path filepath and given projectID, name, contentType
// and expires.
func (object *Object) UploadFromFile(projectID string, name string, contentType string, expires time.Time, filepath string) (err error) {
	file, err := os.Open(filepath)
	if err != nil {
		return err
	}
	defer file.Close()
	fileInfo, err := file.Stat()
	if err != nil {
		return err
	}
	contentLength := fileInfo.Size()
	return object.UploadFromReadSeeker(projectID, name, contentType, contentLength, expires, file)
}

// UploadFromReadSeeker publishes an Object to the Object Service, with given
// name, projectID, contentType, contentLength and expiry, with the object
// content read from readSeeker. The value of contentLength is not validated
// prior to upload.
func (object *Object) UploadFromReadSeeker(projectID string, name string, contentType string, contentLength int64, expires time.Time, readSeeker io.ReadSeeker) (err error) {

	uploadID := slugid.Nice()
	proposedUploadMethods := ProposedUploadMethods{}

	if contentLength < DataInlineMaxSize {
		content, err := ioutil.ReadAll(readSeeker)
		if err != nil {
			return err
		}
		b64 := base64.StdEncoding.EncodeToString(content)
		proposedUploadMethods.DataInline = DataInlineUploadRequest{
			ContentType: contentType,
			ObjectData:  b64,
		}
	}

	proposedUploadMethods.PutURL = PutURLUploadRequest{
		ContentLength: contentLength,
		ContentType:   contentType,
	}

	var uploadResp *CreateUploadResponse
	uploadResp, err = object.CreateUpload(
		name,
		&CreateUploadRequest{
			Expires:               tcclient.Time(expires),
			ProjectID:             projectID,
			UploadID:              uploadID,
			ProposedUploadMethods: proposedUploadMethods,
		},
	)
	if err != nil {
		return err
	}

	defer func() {
		if err == nil {
			err = object.FinishUpload(
				name,
				&FinishUploadRequest{
					ProjectID: projectID,
					UploadID:  uploadID,
				},
			)
		}
	}()

	switch {
	case uploadResp.UploadMethod.DataInline:
		// data is already uploaded -- nothing to do
		return nil
	case uploadResp.UploadMethod.PutURL.URL != "":
		return putURLUpload(object.HTTPBackoffClient, uploadResp.UploadMethod, readSeeker)
	}
	return errors.New("Could not negotiate an upload method")
}

func putURLUpload(httpBackoffClient *httpbackoff.Client, uploadMethod SelectedUploadMethodOrNone, readSeeker io.ReadSeeker) error {
	// perform http PUT to upload to the given URL
	httpClient := &http.Client{}
	httpCall := func() (putResp *http.Response, tempError error, permError error) {
		// Explicitly seek to start here, rather than only after a temp error,
		// since not all temporary errors are caught by this code (e.g. status
		// codes 500-599 are handled by httpbackoff library implicitly).
		_, permError = readSeeker.Seek(0, io.SeekStart)
		if permError != nil {
			// not being able to seek to start is a problem that is unlikely to
			// be solved with retries with exponential backoff, so give up
			// straight away
			return
		}
		var httpRequest *http.Request
		httpRequest, permError = http.NewRequest("PUT", uploadMethod.PutURL.URL, readSeeker)
		if permError != nil {
			return
		}
		for headerName, headerValue := range uploadMethod.PutURL.Headers {
			httpRequest.Header.Set(headerName, headerValue)
		}
		putResp, tempError = httpClient.Do(httpRequest)
		if tempError != nil {
			return
		}
		// bug 1394557: s3 incorrectly returns HTTP 400 for connection
		// inactivity, so make this a temp error rather than a permanent error
		// if it occurs, in case this is a put request to s3
		if putResp.StatusCode == 400 {
			tempError = fmt.Errorf("Status code 400 which might be an intermittent issue - see https://bugzilla.mozilla.org/show_bug.cgi?id=1394557")
		}
		return
	}
	client := httpBackoffClient
	if client == nil {
		client = &httpbackoff.Client{
			BackOffSettings: backoff.NewExponentialBackOff(),
		}
	}
	putResp, _, err := client.Retry(httpCall)
	if putResp != nil {
		defer putResp.Body.Close()
	}
	return err
}
