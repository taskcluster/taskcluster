package model

import (
	"encoding/json"
	"fmt"
	"github.com/petemoore/taskcluster-client-go/utils"
	"io"
	"io/ioutil"
	"net/http"
	"strings"
)

func loadJson(reader io.Reader, schema *string) APIModel {
	var bytes []byte
	bytes, err = ioutil.ReadAll(reader)
	utils.ExitOnFail(err)
	var m APIModel
	switch *schema {
	case "http://schemas.taskcluster.net/base/v1/api-reference.json":
		m = new(API)
	case "http://schemas.taskcluster.net/base/v1/exchanges-reference.json":
		m = new(Exchange)
	}
	err = json.Unmarshal(bytes, m)
	m.postPopulate()
	utils.ExitOnFail(err)
	return m
}

func loadJsonSchema(url string) *JsonSchemaTopLevel {
	var resp *http.Response
	resp, err = http.Get(url)
	utils.ExitOnFail(err)
	defer resp.Body.Close()
	var bytes []byte
	bytes, err = ioutil.ReadAll(resp.Body)
	utils.ExitOnFail(err)
	m := new(JsonSchemaTopLevel)
	err = json.Unmarshal(bytes, m)
	utils.ExitOnFail(err)
	m.postPopulate()
	return m
}

func cacheJsonSchema(url string) {
	// if url is not provided, there is nothing to download
	if url == "" {
		return
	}
	if _, ok := schemas[url]; !ok {
		schemas[url] = loadJsonSchema(url)
	}
}

func LoadAPIs(bytes []byte) ([]APIDefinition, map[string]*JsonSchemaTopLevel) {
	err = json.Unmarshal(bytes, &apis)
	utils.ExitOnFail(err)
	for i := range apis {
		var resp *http.Response
		resp, err = http.Get(apis[i].URL)
		utils.ExitOnFail(err)
		defer resp.Body.Close()
		apis[i].Data = loadJson(resp.Body, &apis[i].SchemaURL)
	}
	return apis, schemas
}

func GenerateCode(generatedFile string) {
	content := `
// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// 
// go generate

package client
`
	content += generateResponseStructs()
	generatedBytes := []byte(content)
	err := ioutil.WriteFile(generatedFile, generatedBytes, 0644)
	utils.ExitOnFail(err)
}

func generateResponseStructs() string {
	content := ""
	// Loop through all json schemas that were found referenced inside the API json schemas...
	for i := range schemas {
		// Capitalise words, and remove spaces and dashes, to acheive struct names in Camel Case,
		// but starting with an upper case letter so that the structs are exported...
		structName := strings.NewReplacer(" ", "", "-", "").Replace(strings.Title(schemas[i].Title))
		for k, baseName := 0, structName; structs[structName]; {
			k++
			structName = fmt.Sprintf("%v%v", baseName, k)
		}
		structs[structName] = true
		schemas[i].StructName = structName
		content += "\n"
		content += fmt.Sprintf("type %v struct {\n", structName)
		for j := range schemas[i].Properties {
			typ := schemas[i].Properties[j].Type
			if typ == "array" {
				if jsonType := schemas[i].Properties[j].Items.Type; jsonType == "" {
					typ = "[]" + schemas[i].Properties[j].Items.Title
				} else {
					typ = "[]" + jsonType
				}
			}
			// comment the struct member with the description from the json
			comment := utils.Indent(schemas[i].Properties[j].Description, "\t// ")
			if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
				comment += "\n"
			}
			content += comment
			// struct member name and type, as part of struct definition
			content += fmt.Sprintf("\t%v %v\n", j, typ)
		}
		content += "}\n"
	}
	return content
}
