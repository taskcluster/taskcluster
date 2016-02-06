package jsonschema2go

import (
	"encoding/json"
	"fmt"
	"go/format"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/taskcluster/taskcluster-client-go/text"
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
		AllOf                *Items                `json:"allOf"`
		AnyOf                *Items                `json:"anyOf"`
		Default              *interface{}          `json:"default"`
		Description          *string               `json:"description"`
		Enum                 []interface{}         `json:"enum"`
		Format               *string               `json:"format"`
		ID                   *string               `json:"id"`
		Items                *JsonSubSchema        `json:"items"`
		Maximum              *int                  `json:"maximum"`
		MaxLength            *int                  `json:"maxLength"`
		Minimum              *int                  `json:"minimum"`
		MinLength            *int                  `json:"minLength"`
		OneOf                *Items                `json:"oneOf"`
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
		Properties          SchemaSet
		SortedPropertyNames []string
		SourceURL           string
	}

	AdditionalProperties struct {
		Boolean    *bool
		Properties *JsonSubSchema
	}

	StringSet map[string]bool
	SchemaSet map[string]*JsonSubSchema
)

var itemsMap map[*Items]string = make(map[*Items]string)

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
	if subSchema.Type == nil && subSchema.Ref == nil {
		result += "Type HAS NOT BEEN SET!!!\n"
	}
	result += describe("TypeName", &subSchema.TypeName)
	result += describe("SourceURL", &subSchema.SourceURL)
	return result
}

func (jsonSubSchema *JsonSubSchema) TypeDefinition(topLevel bool, extraPackages StringSet, rawMessageTypes StringSet) (string, string, string, StringSet, StringSet) {
	comment := "\n"
	if d := jsonSubSchema.Description; d != nil {
		comment += text.Indent(*d, "\t// ")
	}
	if comment[len(comment)-1:] != "\n" {
		comment += "\n"
	}
	if enum := jsonSubSchema.Enum; enum != nil {
		comment += "//\n// Possible values:\n"
		for _, i := range enum {
			switch i.(type) {
			case float64:
				comment += fmt.Sprintf("//   * %v\n", i)
			default:
				comment += fmt.Sprintf("//   * %q\n", i)
			}
		}
	}

	// Create comments for metadata in a single paragraph. Only start new
	// paragraph if we discover after inspecting all possible metadata, that
	// something has been specified. If there is no metadata, no need to create
	// a new paragraph.
	var metadata string
	if def := jsonSubSchema.Default; def != nil {
		var value string
		switch (*def).(type) {
		case bool:
			value = strconv.FormatBool((*def).(bool))
		case float64:
			value = strconv.FormatFloat((*def).(float64), 'g', -1, 64)
		default:
			value = fmt.Sprintf("%q", *def)
		}
		metadata += "// Default:    " + value + "\n"
	}
	if regex := jsonSubSchema.Pattern; regex != nil {
		metadata += "// Syntax:     " + *regex + "\n"
	}
	if minItems := jsonSubSchema.MinLength; minItems != nil {
		metadata += "// Min length: " + strconv.Itoa(*minItems) + "\n"
	}
	if maxItems := jsonSubSchema.MaxLength; maxItems != nil {
		metadata += "// Max length: " + strconv.Itoa(*maxItems) + "\n"
	}
	if minimum := jsonSubSchema.Minimum; minimum != nil {
		metadata += "// Mininum:    " + strconv.Itoa(*minimum) + "\n"
	}
	if maximum := jsonSubSchema.Maximum; maximum != nil {
		metadata += "// Maximum:    " + strconv.Itoa(*maximum) + "\n"
	}
	// Here we check if metadata was specified, and only create new
	// paragraph (`//\n`) if something was.
	if len(metadata) > 0 {
		comment += "//\n" + metadata
	}

	if url := jsonSubSchema.SourceURL; url != "" {
		comment += "//\n// See " + url + "\n"
	}
	for strings.Index(comment, "\n//\n") == 0 {
		comment = "\n" + comment[4:]
	}
	typ := "json.RawMessage"
	if p := jsonSubSchema.Type; p != nil {
		typ = *p
	}
	if p := jsonSubSchema.RefSubSchema; p != nil {
		typ = p.TypeName
	}
	switch typ {
	case "array":
		if jsonType := jsonSubSchema.Items.Type; jsonType != nil {
			var arrayType string
			_, _, arrayType, extraPackages, rawMessageTypes = jsonSubSchema.Items.TypeDefinition(false, extraPackages, rawMessageTypes)
			typ = "[]" + arrayType
		} else {
			if refSubSchema := jsonSubSchema.Items.RefSubSchema; refSubSchema != nil {
				typ = "[]" + refSubSchema.TypeName
			}
		}
	case "object":
		if s := jsonSubSchema.Properties; s != nil {
			typ = fmt.Sprintf("struct {\n")
			members := make(StringSet, len(s.SortedPropertyNames))
			for _, j := range s.SortedPropertyNames {
				s.Properties[j].TypeName = text.GoTypeNameFrom(j, members)
				// recursive call to build structs inside structs
				var subComment, subMember, subType string
				subComment, subMember, subType, extraPackages, rawMessageTypes = s.Properties[j].TypeDefinition(false, extraPackages, rawMessageTypes)
				// struct member name and type, as part of struct definition
				typ += fmt.Sprintf("\t%v%v %v `json:\"%v\"`\n", subComment, subMember, subType, j)
			}
			typ += "}"
		} else {
			typ = "json.RawMessage"
		}
	case "number":
		typ = "float64"
	case "integer":
		typ = "int"
	case "boolean":
		typ = "bool"
	// json type string maps to go type string, so only need to test case of when
	// string is a json date-time, so we can convert to go type Time...
	case "string":
		if f := jsonSubSchema.Format; f != nil {
			if *f == "date-time" {
				typ = "tcclient.Time"
			}
		}
	}
	switch typ {
	case "json.RawMessage":
		extraPackages["encoding/json"] = true
		if topLevel {
			// Special case: we have here a top level RawMessage such as
			// queue.PostArtifactRequest - therefore need to implement
			// Marhsal and Unmarshal methods. See:
			// http://play.golang.org/p/FKHSUmWVFD vs
			// http://play.golang.org/p/erjM6ptIYI
			extraPackages["errors"] = true
			rawMessageTypes[jsonSubSchema.TypeName] = true
		}
	}
	return comment, jsonSubSchema.TypeName, typ, extraPackages, rawMessageTypes
}

func (p Properties) String() string {
	result := ""
	for _, i := range p.SortedPropertyNames {
		result += "Property '" + i + "' =\n" + text.Indent(p.Properties[i].String(), "  ")
	}
	return result
}

func (p *Properties) postPopulate(schemaSet SchemaSet) {
	// now all data should be loaded, let's sort the p.Properties
	if p.Properties != nil {
		p.SortedPropertyNames = make([]string, 0, len(p.Properties))
		for propertyName := range p.Properties {
			p.SortedPropertyNames = append(p.SortedPropertyNames, propertyName)
			// subscehams need to have SourceURL set
			p.Properties[propertyName].setSourceURL(p.SourceURL + "/" + propertyName)
			// subschemas also need to be triggered to postPopulate...
			p.Properties[propertyName].postPopulate(schemaSet)
		}
		sort.Strings(p.SortedPropertyNames)
	}
}

func (p *Properties) setSourceURL(url string) {
	p.SourceURL = url
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
		result += fmt.Sprintf("Item '%v' =\n", i) + text.Indent(j.String(), "  ")
	}
	return result
}

func (items *Items) postPopulate(schemaSet SchemaSet) {
	for i := range *items {
		(*items)[i].setSourceURL(itemsMap[items] + "[" + strconv.Itoa(i) + "]")
		(*items)[i].postPopulate(schemaSet)
		// add to schemas so we get a type generated for it in source code
		schemaSet[(*items)[i].SourceURL] = &(*items)[i]
	}
}

func (items *Items) setSourceURL(url string) {
	// can't set this in the object so need to store outside in global array
	itemsMap[items] = url
}

func describeList(name string, value interface{}) string {
	if reflect.ValueOf(value).IsValid() {
		if !reflect.ValueOf(value).IsNil() {
			return fmt.Sprintf("%v\n", name) + text.Indent(fmt.Sprintf("%v", reflect.Indirect(reflect.ValueOf(value)).Interface()), "  ")
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
	postPopulate(SchemaSet)
	setSourceURL(string)
}

func (subSchema *JsonSubSchema) postPopulateIfNotNil(canPopulate CanPopulate, schemaSet SchemaSet, suffix string) {
	if reflect.ValueOf(canPopulate).IsValid() {
		if !reflect.ValueOf(canPopulate).IsNil() {
			canPopulate.setSourceURL(subSchema.SourceURL + suffix)
			canPopulate.postPopulate(schemaSet)
		}
	}
}

func (subSchema *JsonSubSchema) postPopulate(schemaSet SchemaSet) {
	subSchema.postPopulateIfNotNil(subSchema.AllOf, schemaSet, "/allOf")
	subSchema.postPopulateIfNotNil(subSchema.AnyOf, schemaSet, "/anyOf")
	subSchema.postPopulateIfNotNil(subSchema.OneOf, schemaSet, "/oneOf")
	subSchema.postPopulateIfNotNil(subSchema.Items, schemaSet, "/items")
	subSchema.postPopulateIfNotNil(subSchema.Properties, schemaSet, "/properties")
	// If we have a $ref pointing to another schema, keep a reference so we can
	// discover TypeName later when we generate the type definition
	subSchema.RefSubSchema = schemaSet.cacheJsonSchema(subSchema.Ref)
}

func (subSchema *JsonSubSchema) setSourceURL(url string) {
	subSchema.SourceURL = url
}

func (schemaSet SchemaSet) loadJsonSchema(URL string) *JsonSubSchema {
	var resp *http.Response
	u, err := url.Parse(URL)
	exitOnFail(err)
	var body io.ReadCloser
	switch u.Scheme {
	case "http", "https":
		resp, err = http.Get(URL)
		exitOnFail(err)
		body = resp.Body
	case "file":
		body, err = os.Open(u.Path)
		exitOnFail(err)
	}
	defer body.Close()
	decoder := json.NewDecoder(body)
	m := new(JsonSubSchema)
	err = decoder.Decode(m)
	exitOnFail(err)
	m.SourceURL = URL
	m.postPopulate(schemaSet)
	return m
}

func (schemaSet SchemaSet) cacheJsonSchema(url *string) *JsonSubSchema {
	// if url is not provided, there is nothing to download
	if url == nil || *url == "" {
		return nil
	}
	// workaround for problem where some urls don't end with a #
	if (*url)[len(*url)-1:] != "#" {
		*url += "#"
	}
	// only fetch if we haven't fetched already...
	if _, ok := schemaSet[*url]; !ok {
		schemaSet[*url] = schemaSet.loadJsonSchema(*url)
	}
	return schemaSet[*url]
}

// This is where we generate nested and compoound types in go to represent json payloads
// which are used as inputs and outputs for the REST API endpoints, and also for Pulse
// message bodies for the Exchange APIs.
// Returns the generated code content, and a map of keys of extra packages to import, e.g.
// a generated type might use time.Time, so if not imported, this would have to be added.
// using a map of strings -> bool to simulate a set - true => include
func generateGoTypes(schemaSet SchemaSet) (string, StringSet, StringSet) {

	extraPackages := make(StringSet)
	rawMessageTypes := make(StringSet)
	content := "type (" // intentionally no \n here since each type starts with one already
	// Loop through all json schemas that were found referenced inside the API json schemas...
	for _, i := range schemaSet {
		var newComment, newMember, newType string
		newComment, newMember, newType, extraPackages, rawMessageTypes = i.TypeDefinition(true, extraPackages, rawMessageTypes)
		content += text.Indent(newComment+newMember+" "+newType, "\t") + "\n"
	}
	return content + ")\n\n", extraPackages, rawMessageTypes
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
	// names, so that we don't reuse old names. Set acts like a set
	// of strings.
	TypeName := make(StringSet)

	allSchemas := make(SchemaSet)
	for _, URL := range urls {
		schema := allSchemas.cacheJsonSchema(&URL)
		if schema.Title != nil {
			schema.TypeName = text.GoTypeNameFrom(*schema.Title, TypeName)
		} else {
			schema.TypeName = text.GoTypeNameFrom("var", TypeName)
		}
	}
	types, extraPackages, rawMessageTypes := generateGoTypes(allSchemas)
	content := `// The following code is AUTO-GENERATED. Please DO NOT edit.

package ` + packageName + `

`
	extraPackagesContent := ""
	for j, k := range extraPackages {
		if k {
			extraPackagesContent += text.Indent("\""+j+"\"\n", "\t")
		}
	}

	if extraPackagesContent != "" {
		content += `import (
` + extraPackagesContent + `)

`
	}
	content += types
	content += jsonRawMessageImplementors(rawMessageTypes)
	// format it
	bytes, err := format.Source([]byte(content))
	if err != nil {
		return "", err
	}
	exitOnFail(ioutil.WriteFile(filename, bytes, 0644))
	return absPath, nil
}

func jsonRawMessageImplementors(rawMessageTypes StringSet) string {
	// first sort the order of the rawMessageTypes since when we rebuild, we
	// don't want to generate functions in a different order and introduce
	// diffs against the previous version
	sortedRawMessageTypes := make([]string, len(rawMessageTypes))
	i := 0
	for goType := range rawMessageTypes {
		sortedRawMessageTypes[i] = goType
		i++
	}
	sort.Strings(sortedRawMessageTypes)
	content := ""
	for _, goType := range sortedRawMessageTypes {
		content += `

	// MarshalJSON calls json.RawMessage method of the same name. Required since
	// ` + goType + ` is of type json.RawMessage...
	func (this *` + goType + `) MarshalJSON() ([]byte, error) {
		x := json.RawMessage(*this)
		return (&x).MarshalJSON()
	}

	// UnmarshalJSON is a copy of the json.RawMessage implementation.
	func (this *` + goType + `) UnmarshalJSON(data []byte) error {
		if this == nil {
			return errors.New("` + goType + `: UnmarshalJSON on nil pointer")
		}
		*this = append((*this)[0:0], data...)
		return nil
	}`
	}
	return content
}
