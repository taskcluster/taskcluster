// This package provides exponential backoff support for making HTTP requests.
//
// It uses the github.com/cenkalti/backoff algorithm.
//
// Network failures and HTTP 5xx status codes qualify for retries.
//
// HTTP calls that return HTTP 4xx status codes do not get retried.
//
// If the last HTTP request made does not result in a 2xx HTTP status code, an
// error is returned, together with the data.
//
// There are several utility methods that wrap the standard net/http package
// calls.
//
// Any function that takes no arguments and returns (*http.Response, error) can
// be retried using this library's Retry function.
//
// The methods in this library should be able to run concurrently in multiple
// go routines.
//
// Example Usage
//
// Consider this trivial HTTP GET request:
//
//  res, err := http.Get("http://www.google.com/robots.txt")
//
// This can be rewritten as follows, enabling automatic retries:
//
//  res, attempts, err := httpbackoff.Get("http://www.google.com/robots.txt")
//
// The variable attempts stores the number of http calls that were made (one
// plus the number of retries).
package httpbackoff

import (
	"bufio"
	"bytes"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"time"

	"github.com/cenkalti/backoff"
)

var defaultClient Client = Client{
	BackOffSettings: backoff.NewExponentialBackOff(),
}

type Client struct {
	BackOffSettings *backoff.ExponentialBackOff
}

// Any non 2xx HTTP status code is considered a bad response code, and will
// result in a BadHttpResponseCode.
type BadHttpResponseCode struct {
	HttpResponseCode int
	Message          string
}

// Returns an error message for this bad HTTP response code
func (err BadHttpResponseCode) Error() string {
	return err.Message
}

// Retry is the core library method for retrying http calls.
//
// httpCall should be a function that performs the http operation, and returns
// (resp *http.Response, tempError error, permError error). Errors that should
// cause retries should be returned as tempError. Permanent errors that should
// not result in retries should be returned as permError. Retries are performed
// using the exponential backoff algorithm from the github.com/cenkalti/backoff
// package. Retry automatically treats HTTP 5xx status codes as a temporary
// error, and any other non-2xx HTTP status codes as a permanent error. Thus
// httpCall function does not need to handle the HTTP status code of resp,
// since Retry will take care of it.
//
// Concurrent use of this library method is supported.
func (httpRetryClient *Client) Retry(httpCall func() (resp *http.Response, tempError error, permError error)) (*http.Response, int, error) {
	var tempError, permError error
	var response *http.Response
	attempts := 0
	doHttpCall := func() error {
		response, tempError, permError = httpCall()
		attempts += 1
		if tempError != nil {
			return tempError
		}
		if permError != nil {
			return nil
		}
		// only call this if there is a non 2xx response
		body := func(response *http.Response) string {
			// this is a no-op
			raw, err := httputil.DumpResponse(response, true)
			if err == nil {
				return string(raw)
			}
			return ""
		}
		// now check if http response code is such that we should retry [500, 600)...
		if respCode := response.StatusCode; respCode/100 == 5 {
			return BadHttpResponseCode{
				HttpResponseCode: respCode,
				Message:          "(Intermittent) HTTP response code " + strconv.Itoa(respCode) + "\n" + body(response),
			}
		}
		// now check http response code is ok [200, 300)...
		if respCode := response.StatusCode; respCode/100 != 2 {
			permError = BadHttpResponseCode{
				HttpResponseCode: respCode,
				Message:          "(Permanent) HTTP response code " + strconv.Itoa(respCode) + "\n" + body(response),
			}
			return nil
		}
		return nil
	}

	// Make HTTP API calls using an exponential backoff algorithm...
	b := backoff.ExponentialBackOff(*httpRetryClient.BackOffSettings)
	backoff.RetryNotify(doHttpCall, &b, func(err error, wait time.Duration) {
		log.Printf("Error: %s", err)
	})

	switch {
	case permError != nil:
		return response, attempts, permError
	case tempError != nil:
		return response, attempts, tempError
	default:
		return response, attempts, nil
	}
}

// Retry works the same as HTTPRetryClient.Retry, but uses the default exponential back off settings
func Retry(httpCall func() (resp *http.Response, tempError error, permError error)) (*http.Response, int, error) {
	return defaultClient.Retry(httpCall)
}

// Retry wrapper for http://golang.org/pkg/net/http/#Get where attempts is the number of http calls made (one plus number of retries).
func (httpRetryClient *Client) Get(url string) (resp *http.Response, attempts int, err error) {
	return httpRetryClient.Retry(func() (*http.Response, error, error) {
		resp, err := http.Get(url)
		// assume all errors should result in a retry
		return resp, err, nil
	})
}

// Get works the same as HTTPRetryClient.Get, but uses the default exponential back off settings
func Get(url string) (resp *http.Response, attempts int, err error) {
	return defaultClient.Get(url)
}

// Retry wrapper for http://golang.org/pkg/net/http/#Head where attempts is the number of http calls made (one plus number of retries).
func (httpRetryClient *Client) Head(url string) (resp *http.Response, attempts int, err error) {
	return httpRetryClient.Retry(func() (*http.Response, error, error) {
		resp, err := http.Head(url)
		// assume all errors should result in a retry
		return resp, err, nil
	})
}

// Head works the same as HTTPRetryClient.Head, but uses the default exponential back off settings
func Head(url string) (resp *http.Response, attempts int, err error) {
	return defaultClient.Head(url)
}

// Retry wrapper for http://golang.org/pkg/net/http/#Post where attempts is the number of http calls made (one plus number of retries).
func (httpRetryClient *Client) Post(url string, bodyType string, body []byte) (resp *http.Response, attempts int, err error) {
	return httpRetryClient.Retry(func() (*http.Response, error, error) {
		resp, err := http.Post(url, bodyType, bytes.NewBuffer(body))
		// assume all errors should result in a retry
		return resp, err, nil
	})
}

// Post works the same as HTTPRetryClient.Post, but uses the default exponential back off settings
func Post(url string, bodyType string, body []byte) (resp *http.Response, attempts int, err error) {
	return defaultClient.Post(url, bodyType, body)
}

// Retry wrapper for http://golang.org/pkg/net/http/#PostForm where attempts is the number of http calls made (one plus number of retries).
func (httpRetryClient *Client) PostForm(url string, data url.Values) (resp *http.Response, attempts int, err error) {
	return httpRetryClient.Retry(func() (*http.Response, error, error) {
		resp, err := http.PostForm(url, data)
		// assume all errors should result in a retry
		return resp, err, nil
	})
}

// PostForm works the same as HTTPRetryClient.PostForm, but uses the default exponential back off settings
func PostForm(url string, data url.Values) (resp *http.Response, attempts int, err error) {
	return defaultClient.PostForm(url, data)
}

// Retry wrapper for http://golang.org/pkg/net/http/#Client.Do where attempts is the number of http calls made (one plus number of retries).
func (httpRetryClient *Client) ClientDo(c *http.Client, req *http.Request) (resp *http.Response, attempts int, err error) {
	rawReq, err := httputil.DumpRequestOut(req, true)
	// fatal
	if err != nil {
		return nil, 0, err
	}
	return httpRetryClient.Retry(func() (*http.Response, error, error) {
		newReq, err := http.ReadRequest(bufio.NewReader(bytes.NewBuffer(rawReq)))
		newReq.RequestURI = ""
		newReq.URL = req.URL
		// If the original request doesn't explicitly set Accept-Encoding, then
		// the go standard library will add it, and allow gzip compression, and
		// magically unzip the response transparently. This wouldn't be too
		// much of a problem, except that if the header is explicitly set, then
		// the standard library won't automatically unzip the response. This is
		// arguably a bug in the standard library but we'll work around it by
		// checking this specific condition.
		if req.Header.Get("Accept-Encoding") == "" {
			newReq.Header.Del("Accept-Encoding")
		}
		if err != nil {
			return nil, nil, err // fatal
		}
		resp, err := c.Do(newReq)
		// assume all errors should result in a retry
		return resp, err, nil
	})
}

// ClientDo works the same as HTTPRetryClient.ClientDo, but uses the default exponential back off settings
func ClientDo(c *http.Client, req *http.Request) (resp *http.Response, attempts int, err error) {
	return defaultClient.ClientDo(c, req)
}

// Retry wrapper for http://golang.org/pkg/net/http/#Client.Get where attempts is the number of http calls made (one plus number of retries).
func (httpRetryClient *Client) ClientGet(c *http.Client, url string) (resp *http.Response, attempts int, err error) {
	return httpRetryClient.Retry(func() (*http.Response, error, error) {
		resp, err := c.Get(url)
		// assume all errors should result in a retry
		return resp, err, nil
	})
}

// ClientGet works the same as HTTPRetryClient.ClientGet, but uses the default exponential back off settings
func ClientGet(c *http.Client, url string) (resp *http.Response, attempts int, err error) {
	return defaultClient.ClientGet(c, url)
}

// Retry wrapper for http://golang.org/pkg/net/http/#Client.Head where attempts is the number of http calls made (one plus number of retries).
func (httpRetryClient *Client) ClientHead(c *http.Client, url string) (resp *http.Response, attempts int, err error) {
	return httpRetryClient.Retry(func() (*http.Response, error, error) {
		resp, err := c.Head(url)
		// assume all errors should result in a retry
		return resp, err, nil
	})
}

// ClientHead works the same as HTTPRetryClient.ClientHead, but uses the default exponential back off settings
func ClientHead(c *http.Client, url string) (resp *http.Response, attempts int, err error) {
	return defaultClient.ClientHead(c, url)
}

// Retry wrapper for http://golang.org/pkg/net/http/#Client.Post where attempts is the number of http calls made (one plus number of retries).
func (httpRetryClient *Client) ClientPost(c *http.Client, url string, bodyType string, body []byte) (resp *http.Response, attempts int, err error) {
	return httpRetryClient.Retry(func() (*http.Response, error, error) {
		resp, err := c.Post(url, bodyType, bytes.NewBuffer(body))
		// assume all errors should result in a retry
		return resp, err, nil
	})
}

// ClientPost works the same as HTTPRetryClient.ClientPost, but uses the default exponential back off settings
func ClientPost(c *http.Client, url string, bodyType string, body []byte) (resp *http.Response, attempts int, err error) {
	return defaultClient.ClientPost(c, url, bodyType, body)
}

// Retry wrapper for http://golang.org/pkg/net/http/#Client.PostForm where attempts is the number of http calls made (one plus number of retries).
func (httpRetryClient *Client) ClientPostForm(c *http.Client, url string, data url.Values) (resp *http.Response, attempts int, err error) {
	return httpRetryClient.Retry(func() (*http.Response, error, error) {
		resp, err := c.PostForm(url, data)
		// assume all errors should result in a retry
		return resp, err, nil
	})
}

// ClientPostForm works the same as HTTPRetryClient.ClientPostForm, but uses the default exponential back off settings
func ClientPostForm(c *http.Client, url string, data url.Values) (resp *http.Response, attempts int, err error) {
	return defaultClient.ClientPostForm(c, url, data)
}
