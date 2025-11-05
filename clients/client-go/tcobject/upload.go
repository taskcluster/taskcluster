package tcobject

import (
	"bytes"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/cenkalti/backoff/v3"
	"github.com/taskcluster/httpbackoff/v3"
	tcclient "github.com/taskcluster/taskcluster/v92/clients/client-go"
)

const (
	DataInlineMaxSize = 8192
)

// UploadFromBuf is a convenience method to publish an Object to the Object
// Service with content buf and given projectID, name, contentType, expires,
// and uploadID.
func (object *Object) UploadFromBuf(projectID string, name string, contentType string, expires time.Time, uploadID string, buf []byte) (err error) {
	readSeeker := bytes.NewReader(buf)
	contentLength := int64(len(buf))
	return object.UploadFromReadSeeker(projectID, name, contentType, contentLength, expires, uploadID, readSeeker)
}

// UploadFromFile is a convenience method to publish an Object to the Object
// Server from file with path filepath and given projectID, name, contentType,
// expires, and uploadID.
func (object *Object) UploadFromFile(projectID string, name string, contentType string, expires time.Time, uploadID string, filepath string) (err error) {
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
	return object.UploadFromReadSeeker(projectID, name, contentType, contentLength, expires, uploadID, file)
}

// UploadFromReadSeeker publishes an Object to the Object Service, with given
// name, projectID, contentType, contentLength, expiry, and uploadID, with the
// object content read from readSeeker. The value of contentLength is not
// validated prior to upload.
func (object *Object) UploadFromReadSeeker(projectID string, name string, contentType string, contentLength int64, expires time.Time, uploadID string, readSeeker io.ReadSeeker) (err error) {
	// wrap the readSeeker so that it will capture hashes
	hashingReadSeeker := newHashingReadSeeker(readSeeker)

	proposedUploadMethods := ProposedUploadMethods{}

	if contentLength < DataInlineMaxSize {
		content, err := io.ReadAll(hashingReadSeeker)
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
		if err != nil {
			return
		}

		hashes, err := hashingReadSeeker.hashes(contentLength)
		if err != nil {
			return
		}

		err = object.FinishUpload(
			name,
			&FinishUploadRequest{
				ProjectID: projectID,
				UploadID:  uploadID,
				Hashes:    marshalHashes(hashes),
			},
		)
		if err != nil {
			return
		}
	}()

	switch {
	case uploadResp.UploadMethod.DataInline:
		// data is already uploaded -- nothing to do
		return nil
	case uploadResp.UploadMethod.PutURL.URL != "":
		return putURLUpload(object.HTTPBackoffClient, uploadResp.UploadMethod, hashingReadSeeker)
	}
	return errors.New("could not negotiate an upload method")
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
