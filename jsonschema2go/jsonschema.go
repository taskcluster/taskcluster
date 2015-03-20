package jsonschema2go

import (
	"encoding/json"
	"fmt"
	"go/format"
	"net/http"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

type (
	// Note that all members are backed by pointers, so that nil value can signify non-existence.
	// Otherwise we could not differentiate whether a zero value is non-existence or actually the
	// zero value. For example, if a bool is false, we don't know if it was explictly set to false
	// in the json we read, or whether it was not given. Unmarshaling into a pointer means pointer
	// will be nil pointer if it wasn't read, or a pointer to true/false if it was read from json.
	JsonSubSchema struct {
		AdditionalItems      *bool                 `json:"additionalItems"`
		AdditionalProperties *AdditionalProperties `json:"additionalProperties"`
		AllOf                Items                 `json:"allOf"`
		AnyOf                Items                 `json:"anyOf"`
		Default              interface{}           `json:"default"`
		Description          *string               `json:"description"`
		Enum                 interface{}           `json:"enum"`
		Format               *string               `json:"format"`
		ID                   *string               `json:"id"`
		Items                *JsonSubSchema        `json:"items"`
		Maximum              *int                  `json:"maximum"`
		MaxLength            *int                  `json:"maxLength"`
		Minimum              *int                  `json:"minimum"`
		MinLength            *int                  `json:"minLength"`
		OneOf                Items                 `json:"oneOf"`
		Pattern              *string               `json:"pattern"`
		Properties           *Properties           `json:"properties"`
		Ref                  *string               `json:"$ref"`
		Required             []string              `json:"required"`
		Schema               *string               `json:"$schema"`
		Title                *string               `json:"title"`
		Type                 *string               `json:"type"`

		// non-json fields used for sorting/tracking
		TypeName     string
		SourceURL    string
		RefSubSchema *JsonSubSchema
	}

	Items []JsonSubSchema

	Properties struct {
		Properties          map[string]*JsonSubSchema
		SortedPropertyNames []string
	}

	AdditionalProperties struct {
		Boolean    *bool
		Properties *JsonSubSchema
	}
)

func (subSchema JsonSubSchema) String() string {
	result := ""
	result += describe("Additional Items", subSchema.AdditionalItems)
	result += describe("Additional Properties", subSchema.AdditionalProperties)
	result += describe("All Of", subSchema.AllOf)
	result += describe("Any Of", subSchema.AnyOf)
	result += describe("Default", subSchema.Default)
	result += describe("Description", subSchema.Description)
	result += describe("Enum", subSchema.Enum)
	result += describe("Format", subSchema.Format)
	result += describe("ID", subSchema.ID)
	result += describeList("Items", subSchema.Items)
	result += describe("Maximum", subSchema.Maximum)
	result += describe("MaxLength", subSchema.MaxLength)
	result += describe("Minimum", subSchema.Minimum)
	result += describe("MinLength", subSchema.MinLength)
	result += describeList("OneOf", subSchema.OneOf)
	result += describe("Pattern", subSchema.Pattern)
	result += describeList("Properties", subSchema.Properties)
	result += describe("Ref", subSchema.Ref)
	result += describe("Required", subSchema.Required)
	result += describe("Schema", subSchema.Schema)
	result += describe("Title", subSchema.Title)
	result += describe("Type", subSchema.Type)
	result += describe("TypeName", &subSchema.TypeName)
	result += describe("SourceURL", &subSchema.SourceURL)
	return result
}

func (jsonSubSchema *JsonSubSchema) TypeDefinition(withComments bool, extraPackages map[string]bool) (string, map[string]bool) {
	content := ""
	comment := ""
	if withComments {
		content += "\n"
		if d := jsonSubSchema.Description; d != nil {
			if desc := *d; desc != "" {
				comment = Indent(desc, "// ")
			}
			if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
				comment += "\n"
			}
		}
		if url := jsonSubSchema.SourceURL; url != "" {
			comment += "//\n// See " + url + "\n"
		}
		content += comment
		content += jsonSubSchema.TypeName + " "
	}
	typ := "interface{}"
	if p := jsonSubSchema.Type; p != nil {
		typ = *p
	}
	if p := jsonSubSchema.RefSubSchema; p != nil {
		typ = p.TypeName
	}
	switch typ {
	case "array":
		if jsonType := jsonSubSchema.Items.Type; jsonType != nil {
			var newType string
			newType, extraPackages = jsonSubSchema.Items.TypeDefinition(false, extraPackages)
			typ = "[]" + newType
		}
	case "object":
		if s := jsonSubSchema.Properties; s != nil {
			typ = fmt.Sprintf("struct {\n")
			members := make(map[string]bool, len(s.SortedPropertyNames))
			for _, j := range s.SortedPropertyNames {
				memberName := Normalise(j, members)
				// recursive call to build structs inside structs
				var subType string
				subType, extraPackages = s.Properties[j].TypeDefinition(false, extraPackages)
				// comment the struct member with the description from the json
				comment = ""
				if d := s.Properties[j].Description; d != nil {
					comment = Indent(*d, "\t// ")
				}
				if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
					comment += "\n"
				}
				typ += comment
				// struct member name and type, as part of struct definition
				typ += fmt.Sprintf("\t%v %v `json:\"%v\"`\n", memberName, subType, j)
			}
			typ += "}"
		} else {
			typ = "interface{}"
		}
	case "number":
		typ = "int"
	case "integer":
		typ = "int"
	case "boolean":
		typ = "bool"
	// json type string maps to go type string, so only need to test case of when
	// string is a json date-time, so we can convert to go type time.Time...
	case "string":
		if f := jsonSubSchema.Format; f != nil {
			if *f == "date-time" {
				typ = "time.Time"
				extraPackages["time"] = true
			}
		}
	}
	content += typ
	if withComments {
		content += "\n"
	}
	return content, extraPackages
}

func (p Properties) String() string {
	result := ""
	for _, i := range p.SortedPropertyNames {
		result += "Property '" + i + "' =\n" + Indent(p.Properties[i].String(), "  ")
	}
	return result
}

func (p *Properties) postPopulate(schemaSet map[string]*JsonSubSchema) {
	// now all data should be loaded, let's sort the p.Properties
	if p.Properties != nil {
		p.SortedPropertyNames = make([]string, 0, len(p.Properties))
		for propertyName := range p.Properties {
			p.SortedPropertyNames = append(p.SortedPropertyNames, propertyName)
			// subschemas also need to be triggered to postPopulate...
			p.Properties[propertyName].postPopulate(schemaSet)
		}
		sort.Strings(p.SortedPropertyNames)
	}
}

func (p *Properties) UnmarshalJSON(bytes []byte) (err error) {
	errX := json.Unmarshal(bytes, &p.Properties)
	return errX
}

func (aP *AdditionalProperties) UnmarshalJSON(bytes []byte) (err error) {
	b, p := new(bool), new(JsonSubSchema)
	if err = json.Unmarshal(bytes, b); err == nil {
		aP.Boolean = b
		return
	}
	if err = json.Unmarshal(bytes, p); err == nil {
		aP.Properties = p
	}
	return
}

func (aP AdditionalProperties) String() string {
	if aP.Boolean != nil {
		return strconv.FormatBool(*aP.Boolean)
	}
	return aP.Properties.String()
}

func (items Items) String() string {
	result := ""
	for i, j := range items {
		result += fmt.Sprintf("Item '%v' =\n", i) + Indent(j.String(), "  ")
	}
	return result
}

func (items Items) postPopulate(schemaSet map[string]*JsonSubSchema) {
	for i := range items {
		items[i].postPopulate(schemaSet)
	}
}

func describeList(name string, value interface{}) string {
	if reflect.ValueOf(value).IsValid() {
		if !reflect.ValueOf(value).IsNil() {
			return fmt.Sprintf("%v\n", name) + Indent(fmt.Sprintf("%v", reflect.Indirect(reflect.ValueOf(value)).Interface()), "  ")
		}
	}
	return ""
}

// If item is not null, then return a description of it. If it is a pointer, dereference it first.
func describe(name string, value interface{}) string {
	if reflect.ValueOf(value).IsValid() {
		if !reflect.ValueOf(value).IsNil() {
			return fmt.Sprintf("%-22v = '%v'\n", name, reflect.Indirect(reflect.ValueOf(value)).Interface())
		}
	}
	return ""
}

type CanPopulate interface {
	postPopulate(map[string]*JsonSubSchema)
}

func postPopulateIfNotNil(canPopulate CanPopulate, schemaSet map[string]*JsonSubSchema) {
	if reflect.ValueOf(canPopulate).IsValid() {
		if !reflect.ValueOf(canPopulate).IsNil() {
			canPopulate.postPopulate(schemaSet)
		}
	}
}

func (subSchema *JsonSubSchema) postPopulate(schemaSet map[string]*JsonSubSchema) {
	postPopulateIfNotNil(subSchema.AllOf, schemaSet)
	postPopulateIfNotNil(subSchema.AnyOf, schemaSet)
	postPopulateIfNotNil(subSchema.OneOf, schemaSet)
	postPopulateIfNotNil(subSchema.Items, schemaSet)
	postPopulateIfNotNil(subSchema.Properties, schemaSet)
	// If we have a $ref pointing to another schema, keep a reference so we can
	// discover TypeName later when we generate the type definition
	if subSchema.Ref != nil {
		subSchema.RefSubSchema = cacheJsonSchema(schemaSet, *subSchema.Ref)
	}
}

func loadJsonSchema(schemaSet map[string]*JsonSubSchema, url string) *JsonSubSchema {
	var resp *http.Response
	resp, err := http.Get(url)
	ExitOnFail(err)
	defer resp.Body.Close()
	decoder := json.NewDecoder(resp.Body)
	m := new(JsonSubSchema)
	err = decoder.Decode(m)
	ExitOnFail(err)
	m.postPopulate(schemaSet)
	return m
}

func cacheJsonSchema(schemaSet map[string]*JsonSubSchema, url string) *JsonSubSchema {
	// workaround for problem where some urls don't end with a #
	if (url)[len(url)-1:] != "#" {
		url += "#"
	}
	// only fetch if we haven't fetched already...
	if _, ok := schemaSet[url]; !ok {
		schemaSet[url] = loadJsonSchema(schemaSet, url)
		schemaSet[url].SourceURL = url
	}
	return schemaSet[url]
}

// This is where we generate nested and compoound types in go to represent json payloads
// which are used as inputs and outputs for the REST API endpoints, and also for Pulse
// message bodies for the Exchange APIs.
// Returns the generated code content, and a map of keys of extra packages to import, e.g.
// a generated type might use time.Time, so if not imported, this would have to be added.
// using a map of strings -> bool to simulate a set - true => include
func generateGoTypes(schemaSet map[string]*JsonSubSchema) (string, map[string]bool) {
	extraPackages := make(map[string]bool)
	content := "type (" // intentionally no \n here since each type starts with one already
	// Loop through all json schemas that were found referenced inside the API json schemas...
	for _, i := range schemaSet {
		var newContent string
		newContent, extraPackages = i.TypeDefinition(true, extraPackages)
		content += Indent(newContent, "\t")
	}
	return content + ")\n\n", extraPackages
}

func URLsToFile(filename string, urls ...string) (string, error) {
	// calculate parent dir name of target file, since this will be the package
	// name of the generated code...
	absPath, err := filepath.Abs(filename)
	if err != nil {
		return "", err
	}
	parentDirName := filepath.Base(filepath.Dir(absPath))
	packageName := parentDirName
	if strings.ContainsRune(packageName, '-') {
		packageName = "main"
	}

	// Generate normalised names for schemas. Keep a record of generated type
	// names, so that we don't reuse old names. map[string]bool acts like a set
	// of strings.
	TypeName := make(map[string]bool)

	allSchemas := make(map[string]*JsonSubSchema)
	for _, url := range urls {
		schema := cacheJsonSchema(allSchemas, url)
		if schema.Title != nil {
			schema.TypeName = Normalise(*schema.Title, TypeName)
		} else {
			schema.TypeName = Normalise("var", TypeName)
		}
	}
	types, extraPackages := generateGoTypes(allSchemas)
	content := `// The following code is AUTO-GENERATED. Please DO NOT edit.

package ` + packageName + `

`
	extraPackagesContent := ""
	for j, k := range extraPackages {
		if k {
			extraPackagesContent += Indent("\""+j+"\"", "\t")
		}
	}

	if extraPackagesContent != "" {
		content += `import (
` + extraPackagesContent + `
)

`
	}
	content += types
	// format it
	bytes, err := format.Source([]byte(content))
	if err != nil {
		return "", err
	}
	WriteStringToFile(bytes, filename)
	return absPath, nil
}
