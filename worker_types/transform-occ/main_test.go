package main

import "testing"

func TestFilenameFromURL(t *testing.T) {
	actual := FilenameFromURL("https://go.microsoft.com/fwlink/p/?LinkID=698771", ".exe")
	expected := "sdksetup.exe"
	if actual != expected {
		t.Fatalf("Expected filename was '%v' but got '%v'", expected, actual)
	}
}

func TestCyclicDependency(t *testing.T) {

	_, err := OrderComponents(
		[]Component{
			Component{
				ComponentKey: ComponentKey{
					ComponentName: "abc",
					ComponentType: "123",
				},
				URL: "asdbkasjdb",
				DependsOn: []ComponentKey{
					ComponentKey{
						ComponentName: "ABC",
						ComponentType: "123",
					},
					ComponentKey{
						ComponentName: "XYZ",
						ComponentType: "XYZ",
					},
				},
			}, {
				ComponentKey: ComponentKey{
					ComponentName: "ABC",
					ComponentType: "123",
				},
				URL: "asdbkasjdb",
				DependsOn: []ComponentKey{
					ComponentKey{
						ComponentName: "abc",
						ComponentType: "345",
					},
				},
			}, {
				ComponentKey: ComponentKey{
					ComponentName: "abc",
					ComponentType: "345",
				},
				URL: "asdbkasjdb",
				DependsOn: []ComponentKey{
					ComponentKey{
						ComponentName: "ABC",
						ComponentType: "123",
					},
				},
			}, {
				ComponentKey: ComponentKey{
					ComponentName: "XYZ",
					ComponentType: "XYZ",
				},
			},
		},
	)

	if err == nil {
		t.Fatal("Was expecting an error")
	}

	switch err.(type) {
	case *CyclicDependency:
		t.Logf("Error: %v", err)
	default:
		t.Fatalf("Was expecting an error of type &main.CyclicDependency but got %T: %v", err, err)
	}
}

func TestDependencyNotDefined(t *testing.T) {

	_, err := OrderComponents(
		[]Component{
			Component{
				ComponentKey: ComponentKey{
					ComponentName: "abc",
					ComponentType: "123",
				},
				URL: "asdbkasjdb",
				DependsOn: []ComponentKey{
					ComponentKey{
						ComponentName: "ABC",
						ComponentType: "123",
					},
					ComponentKey{
						ComponentName: "XYZ",
						ComponentType: "XYZ",
					},
				},
			}, {
				ComponentKey: ComponentKey{
					ComponentName: "ABC",
					ComponentType: "123",
				},
				URL: "asdbkasjdb",
			},
		},
	)

	if err == nil {
		t.Fatal("Was expecting an error")
	}

	switch err.(type) {
	case *DependencyDoesNotExist:
		t.Logf("Error: %v", err)
	default:
		t.Fatalf("Was expecting an error of type &main.CyclicDependency but got %T: %v", err, err)
	}
}

func TestDuplicateComponentKey(t *testing.T) {

	_, err := OrderComponents(
		[]Component{
			Component{
				ComponentKey: ComponentKey{
					ComponentName: "abc",
					ComponentType: "123",
				},
				URL: "ASDBKAsjdb",
			}, {
				ComponentKey: ComponentKey{
					ComponentName: "def",
					ComponentType: "123",
				},
				URL: "ASDBKAsjdb",
			}, {
				ComponentKey: ComponentKey{
					ComponentName: "abc",
					ComponentType: "456",
				},
				URL: "ASDBKAsjdb",
			}, {
				ComponentKey: ComponentKey{
					ComponentName: "def",
					ComponentType: "123",
				},
				URL: "asdbkasjdb",
			}, {
				ComponentKey: ComponentKey{
					ComponentName: "ghi",
					ComponentType: "123",
				},
				URL: "asdbkasjdb",
			},
		},
	)

	if err == nil {
		t.Fatal("Was expecting an error")
	}

	switch err.(type) {
	case *DuplicateComponentKey:
		t.Logf("Error: %v", err)
	default:
		t.Fatalf("Was expecting an error of type &main.CyclicDependency but got %T: %v", err, err)
	}
}
