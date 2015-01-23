package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	// "reflect"
	// tcClient "github.com/petemoore/taskcluster-client.go/lib"
)

func loadJson(reader io.Reader, schema string) {
	var bytes []byte
	bytes, err = ioutil.ReadAll(reader)
	exitOnFail()
	fmt.Println("===========================================================")
	switch schema {
	case "http://schemas.taskcluster.net/base/v1/api-reference.json":
		m := API{}
		err = json.Unmarshal(bytes, &m)
		exitOnFail()
		fmt.Println(m)
	case "http://schemas.taskcluster.net/base/v1/exchanges-reference.json":
		m := Exchange{}
		err = json.Unmarshal(bytes, &m)
		exitOnFail()
		fmt.Println(m)
	}
}
