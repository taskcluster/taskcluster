package proxy

import (
	"io"
	"net/http"
	"strings"
)

func (p *proxy) validateRequest(r *http.Request) error {
	return nil
}

func replaceID(path string) string {
	s := path
	if s == "" {
		return s
	}
	s = strings.TrimPrefix(s, "/")
	index := strings.Index(s, "/")
	if index < 0 {
		return s
	}
	return s[index:]
}

func extractID(path string) string {
	path = strings.TrimPrefix(path, "/")
	index := strings.Index(path, "/")
	if index < 0 {
		return path
	}
	return path[:index]
}

func copyAndClose(dest io.WriteCloser, src io.ReadCloser) error {
	defer func() {
		_ = src.Close()
		_ = dest.Close()
	}()
	_, err := io.Copy(dest, src)
	return err
}
