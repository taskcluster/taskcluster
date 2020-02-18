package text_test

import (
	"fmt"

	"github.com/taskcluster/jsonschema2go/text"
)

func ExampleIndent_basic() {
	fmt.Println("1.")
	fmt.Println(text.Indent("", "...."))
	fmt.Println("2.")
	fmt.Println(text.Indent("\n", "...."))
	fmt.Println("3.")
	fmt.Println(text.Indent("line one\nline two", "...."))
	fmt.Println("4.")
	fmt.Println(text.Indent("line one\nline two\n", "...."))
	fmt.Println("5.")
	fmt.Println(text.Indent("line one\nline two\n\n", "...."))
	fmt.Println("Done")

	// Output:
	// 1.
	//
	// 2.
	// ....
	//
	// 3.
	// ....line one
	// ....line two
	// 4.
	// ....line one
	// ....line two
	//
	// 5.
	// ....line one
	// ....line two
	// ....
	//
	// Done
}

func ExampleIndent_nested() {
	fmt.Println(text.Indent("func A(foo string) {\n"+text.Indent("a := []string{\n"+text.Indent("\"x\",\n\"y\",\n\"z\",\n", "\t")+"}\n", "\t")+"}\n", "=> "))
	fmt.Println("Done")

	// Output:
	// => func A(foo string) {
	// => 	a := []string{
	// => 		"x",
	// => 		"y",
	// => 		"z",
	// => 	}
	// => }
	//
	// Done
}

func ExampleUnderline_basic() {
	fmt.Println(text.Underline("Taskcluster Client") + "Please see https://docs.taskcluster.net/manual/tools/clients")

	// Output:
	// Taskcluster Client
	// ==================
	// Please see https://docs.taskcluster.net/manual/tools/clients
}

func ExampleUnderline_multiline() {
	fmt.Println(text.Underline("Taskcluster Client\nGo (golang) Implementation\n13 Jan 2016") + "Please see http://taskcluster.github.io/taskcluster-client-go")

	// Output:
	// Taskcluster Client
	// Go (golang) Implementation
	// 13 Jan 2016
	// ==========================
	// Please see http://taskcluster.github.io/taskcluster-client-go
}

func ExampleIndefiniteArticle() {
	for _, noun := range []string{
		"ant",
		"dog",
		"emu",
		"fish",
		"gopher",
		"hippopotamus",
		"owl",
	} {
		fmt.Println(text.IndefiniteArticle(noun), noun)
	}

	// Output:
	// an ant
	// a dog
	// an emu
	// a fish
	// a gopher
	// a hippopotamus
	// an owl
}

func ExampleGoIdentifierFrom() {
	blacklist := make(map[string]bool)
	fmt.Println(text.GoIdentifierFrom("Azure Artifact Request", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("AzureArtifactRequest", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("Azure artifact request", false, blacklist))
	fmt.Println(text.GoIdentifierFrom("azure-artifact request", false, blacklist))
	fmt.Println(text.GoIdentifierFrom("azure-artifact request", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("List Artifacts Response", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("hello, 世;;;((```[]!@#$界", false, blacklist))
	fmt.Println(text.GoIdentifierFrom(".-4$sjdb2##f \n\txxßßß", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("", false, blacklist))
	fmt.Println(text.GoIdentifierFrom("", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("_", false, blacklist))
	fmt.Println(text.GoIdentifierFrom("grüß", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("333", false, blacklist))
	fmt.Println(text.GoIdentifierFrom("3_33", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("ü", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("üö33", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("Üö33", false, blacklist))
	fmt.Println(text.GoIdentifierFrom("Üö33", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("\xe2\x28\xa1", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("provisioner id", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("provisioner ide", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("provisionerId", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("provisionerId parent", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("provisionerId parent  ", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("urlEndpoint", false, blacklist))
	fmt.Println(text.GoIdentifierFrom("uRLEndpoint", false, blacklist))
	fmt.Println(text.GoIdentifierFrom("URLEndpoint", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("UrlEndpoint", true, blacklist))
	fmt.Println(text.GoIdentifierFrom("UrlEndpoint", false, blacklist))
	fmt.Println(text.GoIdentifierFrom("PDFDocument", false, blacklist))
	fmt.Println(text.GoIdentifierFrom("continue", false, blacklist))

	// Output:
	// AzureArtifactRequest
	// AzureArtifactRequest1
	// azureArtifactRequest
	// azureArtifactRequest1
	// AzureArtifactRequest2
	// ListArtifactsResponse
	// hello世界
	// _4Sjdb2FXxßßß
	// Identifier
	// Identifier1
	// Identifier2
	// Grüß
	// _333
	// _3_33
	// Ü
	// Üö33
	// üö33
	// Üö331
	// Identifier3
	// ProvisionerID
	// ProvisionerIde
	// ProvisionerID1
	// ProvisionerIDParent
	// ProvisionerIDParent1
	// urlEndpoint
	// uRLEndpoint
	// URLEndpoint
	// URLEndpoint1
	// urlEndpoint1
	// pdfDocument
	// continue1
}
