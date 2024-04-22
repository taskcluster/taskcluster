//go:build insecure

package main

func gwCopyToTempFile(filePath string) (string, error) {
	return filePath, nil
}
