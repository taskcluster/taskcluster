package jsonschema2go

import (
	"encoding/json"
	"errors"
	"fmt"
	"go/format"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/ghodss/yaml"
	"github.com/taskcluster/jsonschema2go/text"
)

type (
	// Note that all members are backed by pointers, so that nil value can signify non-existence.
	// Otherwise we could not differentiate whether a zero value is non-existence or actually the
	// zero value. For example, if a bool is false, we don't know if it was explictly set to false
	// in the json we read, or whether it was not given. Unmarshaling into a pointer means pointer
	// will be nil pointer if it wasn't read, or a pointer to true/false if it was read from json.
	JsonSubSchema struct {
		AdditionalItems      *bool                  `json:"additionalItems"`
		AdditionalProperties *AdditionalProperties  `json:"additionalProperties"`
		AllOf                *Items                 `json:"allOf"`
		AnyOf                *Items                 `json:"anyOf"`
		Default              *interface{}           `json:"default"`
		Definitions          *Properties            `json:"definitions"`
		Dependencies         map[string]*Dependency `json:"dependencies"`
		Description          *string                `json:"description"`
		Enum                 []interface{}          `json:"enum"`
		ExclusiveMaximum     *bool                  `json:"exclusiveMaximum"`
		ExclusiveMinimum     *bool                  `json:"exclusiveMinimum"`
		Format               *string                `json:"format"`
		ID                   *string                `json:"id"`
		Items                *JsonSubSchema         `json:"items"`
		Maximum              *int                   `json:"maximum"`
		MaxItems             *int                   `json:"maxItems"`
		MaxLength            *int                   `json:"maxLength"`
		MaxProperties        *int                   `json:"maxProperties"`
		Minimum              *int                   `json:"minimum"`
		MinItems             *int                   `json:"minItems"`
		MinLength            *int                   `json:"minLength"`
		MinProperties        *int                   `json:"minProperties"`
		MultipleOf           *int                   `json:"multipleOf"`
		OneOf                *Items                 `json:"oneOf"`
		Pattern              *string                `json:"pattern"`
		PatternProperties    *Properties            `json:"patternProperties"`
		Properties           *Properties            `json:"properties"`
		Ref                  *string                `json:"$ref"`
		Required             []string               `json:"required"`
		Schema               *string                `json:"$schema"`
		Title                *string                `json:"title"`
		Type                 *string                `json:"type"`
		UniqueItems          *bool                  `json:"uniqueItems"`

		// non-json fields used for sorting/tracking
		TypeName     string         `json:"-"`
		PropertyName string         `json:"-"`
		SourceURL    string         `json:"-"`
		RefSubSchema *JsonSubSchema `json:"-"`
		IsRequired   bool           `json:"-"`
	}

	Items struct {
		Items     []*JsonSubSchema
		SourceURL string
	}

	Properties struct {
		Properties          map[string]*JsonSubSchema
		MemberNames         map[string]string
		SortedPropertyNames []string
		SourceURL           string
	}

	AdditionalProperties struct {
		Boolean    *bool
		Properties *JsonSubSchema
	}

	Dependency struct {
		SchemaDependency   *JsonSubSchema
		PropertyDependency *[]string
	}

	canPopulate interface {
		postPopulate(*Job) error
		setSourceURL(string)
	}

	NameGenerator func(name string, exported bool, blacklist map[string]bool) (identifier string)

	Job struct {
		Package             string
		ExportTypes         bool
		URLs                []string
		result              *Result
		TypeNameGenerator   NameGenerator
		MemberNameGenerator NameGenerator
		SkipCodeGen         bool
	}

	Result struct {
		SourceCode []byte
		SchemaSet  *SchemaSet
	}

	// SchemaSet contains the JsonSubSchemas objects read when performing a Job.
	SchemaSet struct {
		all       map[string]*JsonSubSchema
		used      map[string]*JsonSubSchema
		typeNames stringSet
	}

	stringSet map[string]bool
)

// Ensure url contains "#" by adding it to end if needed
func sanitizeURL(url string) string {
	if strings.ContainsRune(url, '#') {
		return url
	} else {
		return url + "#"
	}
}

func (schemaSet *SchemaSet) SubSchema(url string) *JsonSubSchema {
	return schemaSet.all[sanitizeURL(url)]
}

func (schemaSet *SchemaSet) SortedSanitizedURLs() []string {
	keys := make([]string, len(schemaSet.used))
	i := 0
	for k := range schemaSet.used {
		keys[i] = k
		i++
	}
	sort.Strings(keys)
	return keys
}

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

func (jsonSubSchema *JsonSubSchema) typeDefinition(topLevel bool, extraPackages stringSet, rawMessageTypes stringSet) (comment, typ string) {
	comment = "\n"
	if d := jsonSubSchema.Description; d != nil {
		comment += text.Indent(*d, "// ")
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

	if URL := jsonSubSchema.SourceURL; URL != "" {
		u, err := url.Parse(URL)
		if err == nil && u.Scheme != "file" {
			comment += "//\n// See " + URL + "\n"
		}
	}
	for strings.Index(comment, "\n//\n") == 0 {
		comment = "\n" + comment[4:]
	}

	typ = "json.RawMessage"
	if p := jsonSubSchema.Type; p != nil {
		typ = *p
	}
	if p := jsonSubSchema.RefSubSchema; p != nil {
		typ = p.TypeName
	}
	switch typ {
	case "array":
		if jsonSubSchema.Items != nil {
			if jsonSubSchema.Items.Type != nil {
				var arrayType string
				_, arrayType = jsonSubSchema.Items.typeDefinition(false, extraPackages, rawMessageTypes)
				typ = "[]" + arrayType
			} else {
				if refSubSchema := jsonSubSchema.Items.RefSubSchema; refSubSchema != nil {
					typ = "[]" + refSubSchema.TypeName
				}
			}
		} else {
			typ = "[]interface{}"
		}
	case "object":
		if s := jsonSubSchema.Properties; s != nil {
			typ = fmt.Sprintf("struct {\n")
			for _, j := range s.SortedPropertyNames {
				// recursive call to build structs inside structs
				var subComment, subType string
				subMember := s.MemberNames[j]
				subComment, subType = s.Properties[j].typeDefinition(false, extraPackages, rawMessageTypes)
				jsonStructTagOptions := ""
				if !s.Properties[j].IsRequired {
					jsonStructTagOptions = ",omitempty"
				}
				// struct member name and type, as part of struct definition
				typ += fmt.Sprintf("\t%v%v %v `json:\"%v%v\"`\n", subComment, subMember, subType, j, jsonStructTagOptions)
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
				extraPackages["github.com/taskcluster/taskcluster-client-go/tcclient"] = true
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
	return comment, typ
}

func (p Properties) String() string {
	result := ""
	for _, i := range p.SortedPropertyNames {
		result += "Property '" + i + "' =\n" + text.Indent(p.Properties[i].String(), "  ")
	}
	return result
}

func (p *Properties) postPopulate(job *Job) error {
	// now all data should be loaded, let's sort the p.Properties
	if p.Properties != nil {
		p.SortedPropertyNames = make([]string, 0, len(p.Properties))
		for propertyName := range p.Properties {
			p.SortedPropertyNames = append(p.SortedPropertyNames, propertyName)
			// subscehams need to have SourceURL set
			p.Properties[propertyName].setSourceURL(p.SourceURL + "/" + propertyName)
			p.Properties[propertyName].PropertyName = propertyName
			// subschemas also need to be triggered to postPopulate...
			err := p.Properties[propertyName].postPopulate(job)
			if err != nil {
				return err
			}
		}
		sort.Strings(p.SortedPropertyNames)
		members := make(stringSet, len(p.SortedPropertyNames))
		p.MemberNames = make(map[string]string, len(p.SortedPropertyNames))
		for _, j := range p.SortedPropertyNames {
			p.MemberNames[j] = job.MemberNameGenerator(j, true, members)
		}
	}
	return nil
}

func (p *Properties) setSourceURL(url string) {
	p.SourceURL = url
}

func (i *Items) UnmarshalJSON(bytes []byte) (err error) {
	err = json.Unmarshal(bytes, &i.Items)
	return
}

func (p *Properties) UnmarshalJSON(bytes []byte) (err error) {
	err = json.Unmarshal(bytes, &p.Properties)
	return
}

func (d *Dependency) UnmarshalJSON(bytes []byte) (err error) {
	s, j := &[]string{}, new(JsonSubSchema)
	if err = json.Unmarshal(bytes, s); err == nil {
		d.PropertyDependency = s
		return
	}
	if err = json.Unmarshal(bytes, j); err == nil {
		d.SchemaDependency = j
	}
	return
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
	for i, j := range items.Items {
		result += fmt.Sprintf("Item '%v' =\n", i) + text.Indent(j.String(), "  ")
	}
	return result
}

func (items *Items) postPopulate(job *Job) error {
	for i, j := range (*items).Items {
		j.setSourceURL(items.SourceURL + "[" + strconv.Itoa(i) + "]")
		err := j.postPopulate(job)
		if err != nil {
			return err
		}
		// add to schemas so we get a type generated for it in source code
		job.add(j)
	}
	return nil
}

func (job *Job) add(subSchema *JsonSubSchema) {
	// if we have already included in the schema set, nothing to do...
	if _, ok := job.result.SchemaSet.used[subSchema.SourceURL]; ok {
		return
	}
	job.result.SchemaSet.used[subSchema.SourceURL] = subSchema
	if subSchema.TypeName == "" {
		switch {
		case subSchema.PropertyName != "" && len(subSchema.PropertyName) < 40:
			subSchema.TypeName = job.TypeNameGenerator(subSchema.PropertyName, job.ExportTypes, job.result.SchemaSet.typeNames)
		case subSchema.Title != nil && *subSchema.Title != "" && len(*subSchema.Title) < 40:
			subSchema.TypeName = job.TypeNameGenerator(*subSchema.Title, job.ExportTypes, job.result.SchemaSet.typeNames)
		case subSchema.Description != nil && *subSchema.Description != "" && len(*subSchema.Description) < 40:
			subSchema.TypeName = job.TypeNameGenerator(*subSchema.Description, job.ExportTypes, job.result.SchemaSet.typeNames)
		case subSchema.RefSubSchema != nil && subSchema.RefSubSchema.TypeName != "":
			subSchema.TypeName = subSchema.RefSubSchema.TypeName
		default:
			subSchema.TypeName = job.TypeNameGenerator("var", job.ExportTypes, job.result.SchemaSet.typeNames)
		}
	}
}

func (items *Items) setSourceURL(url string) {
	items.SourceURL = url
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

func (subSchema *JsonSubSchema) postPopulateIfNotNil(canPopulate canPopulate, job *Job, suffix string) error {
	if reflect.ValueOf(canPopulate).IsValid() {
		if !reflect.ValueOf(canPopulate).IsNil() {
			canPopulate.setSourceURL(subSchema.SourceURL + suffix)
			err := canPopulate.postPopulate(job)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func (subSchema *JsonSubSchema) postPopulate(job *Job) (err error) {
	// setSourceURL(string) should always called before postPopulate(*Job), so
	// we can rely on it being already set
	job.result.SchemaSet.all[subSchema.SourceURL] = subSchema
	err = subSchema.postPopulateIfNotNil(subSchema.Definitions, job, "/definitions")
	if err != nil {
		return err
	}
	err = subSchema.postPopulateIfNotNil(subSchema.AllOf, job, "/allOf")
	if err != nil {
		return err
	}
	err = subSchema.postPopulateIfNotNil(subSchema.AnyOf, job, "/anyOf")
	if err != nil {
		return err
	}
	err = subSchema.postPopulateIfNotNil(subSchema.OneOf, job, "/oneOf")
	if err != nil {
		return err
	}
	err = subSchema.postPopulateIfNotNil(subSchema.Items, job, "/items")
	if err != nil {
		return err
	}
	err = subSchema.postPopulateIfNotNil(subSchema.Properties, job, "/properties")
	if err != nil {
		return err
	}
	// If we have a $ref pointing to another schema, keep a reference so we can
	// discover TypeName later when we generate the type definition
	if ref := subSchema.Ref; ref != nil && *ref != "" {
		// only need to cache a schema if it isn't relative to the current document
		if !strings.HasPrefix(*ref, "#") {
			subSchema.RefSubSchema, err = job.cacheJsonSchema(*subSchema.Ref)
			if err != nil {
				return err
			}
		}
	}
	// Find and tag subschema properties that are in required list
	for _, req := range subSchema.Required {
		if subSubSchema, ok := subSchema.Properties.Properties[req]; ok {
			subSubSchema.IsRequired = true
		} else {
			panic(fmt.Sprintf("Schema %v has a required property %v but this property definition cannot be found", subSchema.SourceURL, req))
		}
	}
	return nil
}

func (subSchema *JsonSubSchema) setSourceURL(url string) {
	subSchema.SourceURL = url
}

func (job *Job) loadJsonSchema(URL string) (subSchema *JsonSubSchema, err error) {
	var resp *http.Response
	u, err := url.Parse(URL)
	if err != nil {
		return
	}
	var body io.ReadCloser
	// TODO: may be better to use https://golang.org/pkg/net/http/#NewFileTransport here??
	switch u.Scheme {
	case "http", "https":
		resp, err = http.Get(URL)
		if err != nil {
			return
		}
		body = resp.Body
	case "file":
		body, err = os.Open(u.Path)
		if err != nil {
			return
		}
	default:
		fmt.Printf("Unknown scheme: '%s'\n", u.Scheme)
		fmt.Printf("URL: '%s'\n", URL)
	}
	defer body.Close()
	data, err := ioutil.ReadAll(body)
	if err != nil {
		return
	}
	// json is valid YAML, so we can safely convert, even if it is already json
	j, err := yaml.YAMLToJSON(data)
	if err != nil {
		return
	}
	subSchema = new(JsonSubSchema)
	err = json.Unmarshal(j, subSchema)
	if err != nil {
		return
	}
	subSchema.setSourceURL(sanitizeURL(URL))
	err = subSchema.postPopulate(job)
	return
}

func (job *Job) cacheJsonSchema(url string) (*JsonSubSchema, error) {
	// if url is not provided, there is nothing to download
	if url == "" {
		return nil, errors.New("Empty url in cacheJsonSchema")
	}
	sanitizedURL := sanitizeURL(url)
	// only fetch if we haven't fetched already...
	if _, ok := job.result.SchemaSet.all[sanitizedURL]; !ok {
		return job.loadJsonSchema(sanitizedURL)
	}
	return job.result.SchemaSet.SubSchema(sanitizedURL), nil
}

// This is where we generate nested and compoound types in go to represent json payloads
// which are used as inputs and outputs for the REST API endpoints, and also for Pulse
// message bodies for the Exchange APIs.
// Returns the generated code content, and a map of keys of extra packages to import, e.g.
// a generated type might use time.Time, so if not imported, this would have to be added.
// using a map of strings -> bool to simulate a set - true => include
func generateGoTypes(schemaSet *SchemaSet) (string, stringSet, stringSet) {
	extraPackages := make(stringSet)
	rawMessageTypes := make(stringSet)
	content := "type (" // intentionally no \n here since each type starts with one already
	// Loop through all json schemas that were found referenced inside the API json schemas...
	typeDefinitions := make(map[string]string)
	typeNames := make([]string, 0, len(schemaSet.used))
	for _, i := range schemaSet.used {
		var newComment, newType string
		newComment, newType = i.typeDefinition(true, extraPackages, rawMessageTypes)
		typeDefinitions[i.TypeName] = text.Indent(newComment+i.TypeName+" "+newType, "\t")
		typeNames = append(typeNames, i.TypeName)
	}
	sort.Strings(typeNames)
	for _, t := range typeNames {
		content += typeDefinitions[t] + "\n"
	}
	return content + ")\n\n", extraPackages, rawMessageTypes
}

func (job *Job) Execute() (*Result, error) {
	// Generate normalised names for schemas. Keep a record of generated type
	// names, so that we don't reuse old names. Set acts like a set
	// of strings.
	job.result = new(Result)
	job.result.SchemaSet = &SchemaSet{
		all:       make(map[string]*JsonSubSchema),
		used:      make(map[string]*JsonSubSchema),
		typeNames: make(stringSet),
	}
	if job.TypeNameGenerator == nil {
		job.TypeNameGenerator = text.GoIdentifierFrom
	}
	if job.MemberNameGenerator == nil {
		job.MemberNameGenerator = text.GoIdentifierFrom
	}
	for _, URL := range job.URLs {
		j, err := job.cacheJsonSchema(URL)
		if err != nil {
			return nil, err
		}
		// note we don't add inside cacheJsonSchema/loadJsonSchema
		// since we don't want to add e.g. top level items if only
		// definitions inside the schema are referenced
		job.add(j)
	}

	// link schemas (update cross references between schemas)
	for _, j := range job.result.SchemaSet.all {
		// if there is a referenced schema...
		if j.Ref != nil && *j.Ref != "" {
			// see if it is relative to current doc, or absolute reference
			var fullyQualifiedRef string
			if (*j.Ref)[0] == '#' {
				fullyQualifiedRef = j.SourceURL[:strings.Index(j.SourceURL, "#")] + *j.Ref
			} else {
				fullyQualifiedRef = sanitizeURL(*j.Ref)
			}
			j.RefSubSchema = job.result.SchemaSet.all[fullyQualifiedRef]
			job.add(j.RefSubSchema)
		}
	}

	var err error
	if !job.SkipCodeGen {
		types, extraPackages, rawMessageTypes := generateGoTypes(job.result.SchemaSet)
		content := `// This source code file is AUTO-GENERATED by github.com/taskcluster/jsonschema2go

package ` + job.Package + `

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
		job.result.SourceCode, err = format.Source([]byte(content))
		// imports should be good, so no need to run
		// https://godoc.org/golang.org/x/tools/imports#Process
	}
	return job.result, err
}

func jsonRawMessageImplementors(rawMessageTypes stringSet) string {
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
