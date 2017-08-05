package fileutil

import (
	"encoding/json"
	"io/ioutil"
	"log"
)

func WriteToFileAsJSON(obj interface{}, filename string) error {
	jsonBytes, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return err
	}
	log.Printf("Saving file %v with content:\n%v\n", filename, string(jsonBytes))
	return ioutil.WriteFile(filename, append(jsonBytes, '\n'), 0644)
}
