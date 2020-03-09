package fileutil

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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

func Copy(dst, src string) (nBytes int64, err error) {
	var sourceFileStat os.FileInfo
	sourceFileStat, err = os.Stat(src)
	if err != nil {
		return
	}
	if !sourceFileStat.Mode().IsRegular() {
		err = fmt.Errorf("Cannot copy %s to %s: %s is not a regular file", src, dst, src)
		return
	}
	var source *os.File
	source, err = os.Open(src)
	if err != nil {
		return
	}
	closeFile := func(file *os.File) {
		err2 := file.Close()
		if err == nil {
			err = err2
		}
	}
	defer closeFile(source)
	var destination *os.File
	destination, err = os.Create(dst)
	if err != nil {
		return
	}
	defer closeFile(destination)
	nBytes, err = io.Copy(destination, source)
	return
}
