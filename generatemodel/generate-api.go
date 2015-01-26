package main

import (
	"encoding/json"
	"io"
	"io/ioutil"
)

func loadJson(reader io.Reader, schema *string) APIModel {
	var bytes []byte
	bytes, err = ioutil.ReadAll(reader)
	exitOnFail()
	var m APIModel
	switch *schema {
	case "http://schemas.taskcluster.net/base/v1/api-reference.json":
		m = new(API)
	case "http://schemas.taskcluster.net/base/v1/exchanges-reference.json":
		m = new(Exchange)
	}
	err = json.Unmarshal(bytes, m)
	m.postPopulate()
	exitOnFail()
	return m
}
