package tcobject

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/cenkalti/backoff/v3"
	"github.com/orcaman/writerseeker"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/internal"
)

type HTTPRetryError = internal.HTTPRetryError

// DownloadToBuf is a convenience method to download an object to an in-memory
// byte slice. Returns the object itself, the Content-Type and Content-Length of
// the downloaded object.
func (object *Object) DownloadToBuf(name string) (buf []byte, contentType string, contentLength int64, err error) {
	writeSeeker := &writerseeker.WriterSeeker{}
	contentType, contentLength, err = object.DownloadToWriteSeeker(name, writeSeeker)
	if err != nil {
		return
	}
	reader := writeSeeker.BytesReader()
	buf = make([]byte, reader.Len())
	_, err = reader.Read(buf)
	return
}

// DownloadToFile is a convenience method to download an object to a file. The
// file is overwritten if it already exists. Returns the Content-Type and
// Content-Length of the downloaded object.
func (object *Object) DownloadToFile(name string, filepath string) (contentType string, contentLength int64, err error) {
	writeSeeker, err := os.Create(filepath)
	if err != nil {
		return "", 0, err
	}
	defer func() {
		err2 := writeSeeker.Close()
		if err == nil {
			err = err2
		}
	}()
	return object.DownloadToWriteSeeker(name, writeSeeker)
}

// getUrlDownload implements the getUrl download method.
func (object *Object) getUrlDownload(rawResponse *DownloadObjectResponse, name string, writeSeeker io.WriteSeeker) (contentType string, contentLength int64, err error) {
	downloadResponse := GetURLDownloadResponse{}
	responseUsed := false
	err = json.Unmarshal(*rawResponse, &downloadResponse)
	if err != nil {
		return
	}

	// wrap the writeSeeker so that we can get the hashes of the received data
	hashingWriter := newHashingWriteSeeker(writeSeeker)

	retryFunc := func() (resp *http.Response, tempError error, permError error) {
		// Explicitly seek to start here, rather than only after a temp error,
		// since not all temporary errors are caught by this code (e.g. status
		// codes 500-599 are handled by httpbackoff library implicitly).
		_, permError = hashingWriter.Seek(0, io.SeekStart)
		if permError != nil {
			// not being able to seek to start is a problem that is unlikely to
			// be solved with retries with exponential backoff, so give up
			// straight away
			return
		}

		// if the URL has expired, fetch a new one, verifying that each response
		// is used at least once to avoid infinitely re-fetching
		if responseUsed && time.Time(downloadResponse.Expires).Before(time.Now()) {
			rawResponse, err = object.StartDownload(
				name,
				&DownloadObjectRequest{
					AcceptDownloadMethods: SupportedDownloadMethods{GetURL: true},
				},
			)
			if err != nil {
				return
			}
			err = json.Unmarshal(*rawResponse, &downloadResponse)
			if err != nil {
				return
			}
			if downloadResponse.Method != "getUrl" {
				err = fmt.Errorf("got unexpected download method %v", downloadResponse.Method)
				return
			}
			responseUsed = false
		}

		// Get the URL.  Note that this adds `Acccept-Encoding: gzip` and will
		// automatically un-gzip a response if necessary.
		responseUsed = true
		resp, tempError = http.Get(downloadResponse.URL)

		// httpbackoff handles http status codes, so we can consider all errors worth retrying here
		if tempError != nil || resp.StatusCode != http.StatusOK {
			// temporary error!
			return
		}
		defer resp.Body.Close()
		contentType = resp.Header.Get("Content-Type")
		contentLength, tempError = io.Copy(hashingWriter, resp.Body)
		return
	}
	var resp *http.Response
	// HTTP status codes handled here automatically
	client := object.HTTPBackoffClient
	if client == nil {
		client = &httpbackoff.Client{
			BackOffSettings: backoff.NewExponentialBackOff(),
		}
	}
	var attempts int
	resp, attempts, err = client.Retry(retryFunc)
	if err != nil {
		err = HTTPRetryError{
			Attempts: attempts,
			Err:      err,
		}
	}
	resp.Body.Close()
	if err != nil {
		return
	}

	// verify hashes if no error has occurred so far.  Note that the download is not
	// retried if hash verification fails.
	if err == nil {
		var hashes map[string]string
		hashes, err = unmarshalHashes(downloadResponse.Hashes)
		if err != nil {
			err = HTTPRetryError{
				Attempts: attempts,
				Err:      err,
			}
			return
		}
		err = verifyHashes(hashingWriter, hashes)
		if err != nil {
			err = HTTPRetryError{
				Attempts: attempts,
				Err:      err,
			}
			return
		}
	}

	// if there is an error, empty everything else out so that callers do not use the
	// untrusted returned data
	if err != nil {
		contentType = ""
		contentLength = 0
		_, _ = hashingWriter.Seek(0, io.SeekStart)
		return
	}
	return
}

// verifyHashes verifies that the hashes observed by the hashingWriter match
// those in hashes, where present, and that at least one is present.
func verifyHashes(hashingWriter *hashingWriteSeeker, expectedHashes map[string]string) error {
	observedHashes, err := hashingWriter.hashes()
	if err != nil {
		return err
	}

	// this will be set to true when an acceptable (that is, not deprecated) hash
	// algorithm is found with a valid hash.
	var someValidAcceptableHash bool

	for algo, oh := range observedHashes {
		if eh, ok := expectedHashes[algo]; ok {
			if oh != eh {
				return fmt.Errorf("validation of object data's %s hash failed", algo)
			}
			for _, a := range ACCEPTABLE_HASHES {
				if algo == a {
					someValidAcceptableHash = true
				}
			}
		}
	}

	if !someValidAcceptableHash {
		return errors.New("no acceptable hashes found in object metadata")
	}

	return nil
}

// DownloadToWriteSeeker downloads the named object from the object service and
// writes it to writeSeeker, retrying if intermittent errors occur. Returns
// the Content-Type and Content-Length of the downloaded object.
func (object *Object) DownloadToWriteSeeker(name string, writeSeeker io.WriteSeeker) (contentType string, contentLength int64, err error) {
	downloadObjectResponse, err := object.StartDownload(
		name,
		&DownloadObjectRequest{
			AcceptDownloadMethods: SupportedDownloadMethods{
				GetURL: true,
			},
		},
	)
	if err != nil {
		return "", 0, err
	}

	var bareResp struct{ Method string }
	err = json.Unmarshal(*downloadObjectResponse, &bareResp)
	if err != nil {
		return "", 0, err
	}

	switch bareResp.Method {
	case "getUrl":
		return object.getUrlDownload(downloadObjectResponse, name, writeSeeker)
	}
	return "", 0, fmt.Errorf("unknown download method %q for object %q", bareResp.Method, name)
}
