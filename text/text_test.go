package text_test

import (
	"fmt"

	"github.com/taskcluster/taskcluster-client-go/text"
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
	fmt.Println(text.Underline("TaskCluster Client") + "Please see http://docs.taskcluster.net/tools/clients")

	// Output:
	// TaskCluster Client
	// ==================
	// Please see http://docs.taskcluster.net/tools/clients
}

func ExampleUnderline_multiline() {
	fmt.Println(text.Underline("TaskCluster Client\nGo (golang) Implementation\n13 Jan 2016") + "Please see http://taskcluster.github.io/taskcluster-client-go")

	// Output:
	// TaskCluster Client
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
	fmt.Println(text.GoIdentifierFrom("Azure Artifact Request", blacklist))
	fmt.Println(text.GoIdentifierFrom("AzureArtifactRequest", blacklist))
	fmt.Println(text.GoIdentifierFrom("Azure artifact request", blacklist))
	fmt.Println(text.GoIdentifierFrom("azure-artifact request", blacklist))
	fmt.Println(text.GoIdentifierFrom("List Artifacts Response", blacklist))
	fmt.Println(text.GoIdentifierFrom("hello, 世;;;((```[]!@#$界", blacklist))
	fmt.Println(text.GoIdentifierFrom(".-4$sjdb2##f \n\txxßßß", blacklist))
	fmt.Println(text.GoIdentifierFrom("", blacklist))
	fmt.Println(text.GoIdentifierFrom("", blacklist))
	fmt.Println(text.GoIdentifierFrom("_", blacklist))
	fmt.Println(text.GoIdentifierFrom("grüß", blacklist))
	fmt.Println(text.GoIdentifierFrom("333", blacklist))
	fmt.Println(text.GoIdentifierFrom("3_33", blacklist))

	// Output:
	// AzureArtifactRequest
	// AzureArtifactRequest1
	// AzureArtifactRequest2
	// AzureArtifactRequest3
	// ListArtifactsResponse
	// Hello世界
	// _4Sjdb2FXxßßß
	// Identifier
	// Identifier1
	// Identifier2
	// Grüß
	// _333
	// _3_33
}
