package internal

import (
	"io"
	"net/http"

	"github.com/cenkalti/backoff/v3"
	"github.com/taskcluster/httpbackoff/v3"
)

type HTTPRetryError struct {
	Attempts int
	Err      error
}

func (re HTTPRetryError) Error() string {
	return re.Err.Error()
}

// Get the given URL, retrying based on the configuration of the given httpbackoff client, and writing the result to the given WriteSeeker.
func GetURL(httpBackoffClient *httpbackoff.Client, url string, writeSeeker io.WriteSeeker) (contentType string, contentLength int64, err error) {
	// Calling httpbackoff.Get(url) here would not be sufficient since that
	// function only wraps the HTTP GET call, and it is left for the caller to
	// consume the response body.  We need to retry the GET if there is a
	// failure when reading from the response body, and therefore a custom
	// retry function is used that also reads the full response body.
	retryFunc := func() (resp *http.Response, tempError error, permError error) {
		// Explicitly seek to start here, rather than only after a temp error,
		// since not all temporary errors are caught by this code (e.g. status
		// codes 500-599 are handled by httpbackoff library implicitly).
		_, permError = writeSeeker.Seek(0, io.SeekStart)
		if permError != nil {
			// not being able to seek to start is a problem that is unlikely to
			// be solved with retries with exponential backoff, so give up
			// straight away
			return
		}
		resp, tempError = http.Get(url)
		// httpbackoff handles http status codes, so we can consider all errors worth retrying here
		if tempError != nil {
			// temporary error!
			return
		}
		defer resp.Body.Close()
		contentType = resp.Header.Get("Content-Type")
		contentLength, tempError = io.Copy(writeSeeker, resp.Body)
		return
	}
	var resp *http.Response
	// HTTP status codes handled here automatically
	client := httpBackoffClient
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
	defer resp.Body.Close()
	return
}
