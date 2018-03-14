package fileutil

import (
	"encoding/json"
	"io/ioutil"
	"log"
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
