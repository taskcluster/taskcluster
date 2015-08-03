package scopes

import (
	"testing"
)

func accept(t *testing.T, givenScopes Given, requiredScopes Required) {
	if !givenScopes.Satisfies(&requiredScopes) {
		t.Errorf("Expected given scopes %q to satisfy required scopes %q, but did not.", givenScopes, requiredScopes)
	}
}

func reject(t *testing.T, givenScopes Given, requiredScopes Required) {
	if givenScopes.Satisfies(&requiredScopes) {
		t.Errorf("Expected given scopes %q *not* to satisfy required scopes %q, but it did.", givenScopes, requiredScopes)
	}
}

func TestScopes1(t *testing.T) {
	accept(
		t,
		[]string{
			"abc:*",
			"123:4:56",
			"xyz",
			"AB:*",
		},
		[][]string{
			{"abc:def", "AB:CD:EF"},
			{"123:4:5"},
			{"abc:def", "123:4"},
			{"Xxyz"},
		},
	)
}

func TestScopes2(t *testing.T) {
	accept(
		t,
		[]string{
			"123!@#ASD%*",
		},
		[][]string{
			{"123!@#ASD%ggg"},
		},
	)
}

func TestScopes3(t *testing.T) {
	reject(
		t,
		[]string{
			"23!@#ASD%*",
		},
		[][]string{
			{"123!@#ASD%ggg"},
		},
	)
}

func TestScopes4(t *testing.T) {
	accept(
		t,
		[]string{
			"*",
		},
		[][]string{
			{"123!@#ASD%ggg", "QWERTY", "12345"},
			{"ZXCVB", "!!!!", "qWeRt"},
		},
	)
}

func TestScopes5(t *testing.T) {
	reject(
		t,
		[]string{
			":*",
		},
		[][]string{
			{"*"},
		},
	)
}

func TestScope6(t *testing.T) {
	accept(
		t,
		[]string{
			"*",
		},
		[][]string{
			{"*"},
		},
	)
}

func TestScopes7(t *testing.T) {
	reject(
		t,
		[]string{
			"abc:*",
			"123:4:56",
			"xyz",
		},
		[][]string{
			{"abc:def", "AB:CD:EF"},
			{"123:4:5"},
			{"abc:def", "123:4"},
			{"Xxyz"},
		},
	)
}
