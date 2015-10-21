package model

import (
	"encoding/json"
	"fmt"
	"github.com/taskcluster/taskcluster-client-go/codegenerator/utils"
	"reflect"
	"sort"
	"strconv"
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
		TypeName       string
		IsInputSchema  bool
		IsOutputSchema bool
		SourceURL      string
		RefSubSchema   *JsonSubSchema
		APIDefinition  *APIDefinition
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
	result += describe("IsInputSchema", &subSchema.IsInputSchema)
	result += describe("IsOutputSchema", &subSchema.IsOutputSchema)
	result += describe("SourceURL", &subSchema.SourceURL)
	return result
}

func (jsonSubSchema *JsonSubSchema) TypeDefinition(withComments bool, extraPackages map[string]bool, rawMessageTypes map[string]bool) (string, map[string]bool, map[string]bool) {
	content := ""
	comment := ""
	if withComments {
		content += "\n"
		if d := jsonSubSchema.Description; d != nil {
			if desc := *d; desc != "" {
				comment = utils.Indent(desc, "// ")
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
			var newType string
			newType, extraPackages, rawMessageTypes = jsonSubSchema.Items.TypeDefinition(false, extraPackages, rawMessageTypes)
			typ = "[]" + newType
		} else {
			if refSubSchema := jsonSubSchema.Items.RefSubSchema; refSubSchema != nil {
				typ = "[]" + refSubSchema.TypeName
			}
		}
	case "object":
		if s := jsonSubSchema.Properties; s != nil {
			typ = fmt.Sprintf("struct {\n")
			members := make(map[string]bool, len(s.SortedPropertyNames))
			for _, j := range s.SortedPropertyNames {
				memberName := utils.Normalise(j, members)
				// recursive call to build structs inside structs
				var subType string
				subType, extraPackages, rawMessageTypes = s.Properties[j].TypeDefinition(false, extraPackages, rawMessageTypes)
				// comment the struct member with the description from the json
				comment = ""
				if d := s.Properties[j].Description; d != nil {
					comment = utils.Indent(*d, "\t// ")
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
			typ = "map[string]json.RawMessage"
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
			}
		}
	}
	switch typ {
	case "time.Time":
		extraPackages["time"] = true
	case "json.RawMessage":
		extraPackages["encoding/json"] = true
		if withComments {
			// Special case: we have here a top level RawMessage such as
			// queue.PostArtifactRequest - therefore need to implement
			// Marhsal and Unmarshal methods. See:
			// http://play.golang.org/p/FKHSUmWVFD vs
			// http://play.golang.org/p/erjM6ptIYI
			extraPackages["errors"] = true
			rawMessageTypes[jsonSubSchema.TypeName] = true
		}
	case "map[string]json.RawMessage":
		extraPackages["encoding/json"] = true
	}
	content += typ
	if withComments {
		content += "\n"
	}
	return content, extraPackages, rawMessageTypes
}

func (p Properties) String() string {
	result := ""
	for _, i := range p.SortedPropertyNames {
		result += "Property '" + i + "' =\n" + utils.Indent(p.Properties[i].String(), "  ")
	}
	return result
}

func (p *Properties) postPopulate(apiDef *APIDefinition) {
	// now all data should be loaded, let's sort the p.Properties
	if p.Properties != nil {
		p.SortedPropertyNames = make([]string, 0, len(p.Properties))
		for propertyName := range p.Properties {
			p.SortedPropertyNames = append(p.SortedPropertyNames, propertyName)
			// subschemas also need to be triggered to postPopulate...
			p.Properties[propertyName].postPopulate(apiDef)
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
		result += fmt.Sprintf("Item '%v' =\n", i) + utils.Indent(j.String(), "  ")
	}
	return result
}

func (items Items) postPopulate(apiDef *APIDefinition) {
	for i := range items {
		items[i].postPopulate(apiDef)
	}
}

func describeList(name string, value interface{}) string {
	if reflect.ValueOf(value).IsValid() {
		if !reflect.ValueOf(value).IsNil() {
			return fmt.Sprintf("%v\n", name) + utils.Indent(fmt.Sprintf("%v", reflect.Indirect(reflect.ValueOf(value)).Interface()), "  ")
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
	postPopulate(*APIDefinition)
}

func postPopulateIfNotNil(canPopulate CanPopulate, apiDef *APIDefinition) {
	if reflect.ValueOf(canPopulate).IsValid() {
		if !reflect.ValueOf(canPopulate).IsNil() {
			canPopulate.postPopulate(apiDef)
		}
	}
}

func (subSchema *JsonSubSchema) postPopulate(apiDef *APIDefinition) {
	postPopulateIfNotNil(subSchema.AllOf, apiDef)
	postPopulateIfNotNil(subSchema.AnyOf, apiDef)
	postPopulateIfNotNil(subSchema.OneOf, apiDef)
	postPopulateIfNotNil(subSchema.Items, apiDef)
	postPopulateIfNotNil(subSchema.Properties, apiDef)
	// If we have a $ref pointing to another schema, keep a reference so we can
	// discover TypeName later when we generate the type definition
	subSchema.RefSubSchema = apiDef.cacheJsonSchema(subSchema.Ref)
}
