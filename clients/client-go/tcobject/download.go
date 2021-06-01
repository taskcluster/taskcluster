package tcobject

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/orcaman/writerseeker"
	"github.com/taskcluster/taskcluster/v44/clients/client-go/internal"
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

// DownloadToWriteSeeker downloads the named object from the object service and
// writes it to writeSeeker, retrying if intermittent errors occur. Returns
// the Content-Type and Content-Length of the downloaded object.
func (object *Object) DownloadToWriteSeeker(name string, writeSeeker io.WriteSeeker) (contentType string, contentLength int64, err error) {
	downloadObjectResponse, err := object.StartDownload(
		name,
		&DownloadObjectRequest{
			AcceptDownloadMethods: SupportedDownloadMethods{
				Simple: true,
			},
		},
	)
	if err != nil {
		return "", 0, err
	}

	resp := SimpleDownloadResponse{}
	err = json.Unmarshal(*downloadObjectResponse, &resp)
	if err != nil {
		return "", 0, err
	}

	switch resp.Method {
	case "simple":
		url := resp.URL
		return internal.GetURL(object.HTTPBackoffClient, url, writeSeeker)
	}
	return "", 0, fmt.Errorf("Unknown download method %q in response to object.StartDownload call for object %q with \"acceptDownloadMethods\":{\"simple\":true}", resp.Method, name)
}
