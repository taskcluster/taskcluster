package fileutil

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
)

func WriteToFileAsJSON(obj interface{}, filename string) error {
	jsonBytes, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return err
	}
	absPath, err := filepath.Abs(filename)
	if err != nil {
		log.Printf("Saving file %v (unknown absolute path: %v)", filename, err)
	} else {
		log.Printf("Saving file %v (absolute path: %v)", filename, absPath)
	}
	return ioutil.WriteFile(filename, append(jsonBytes, '\n'), 0644)
}

func CalculateSHA256(file string) (hash string, err error) {
	rawContent, err := os.Open(file)
	if err != nil {
		return
	}
	defer rawContent.Close()
	hasher := sha256.New()
	_, err = io.Copy(hasher, rawContent)
	if err != nil {
		panic(err)
	}
	hash = hex.EncodeToString(hasher.Sum(nil))
	return
}
