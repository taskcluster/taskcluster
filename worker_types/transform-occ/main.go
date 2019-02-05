package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	pkgurl "net/url"
	"os"
	"path"
	"strings"
)

type (
	OCCManifest struct {
		Components []Component
	}
	Component struct {
		ComponentKey
		Action      string         `json:"Action"`
		Arguments   []string       `json:"Arguments"`
		Command     string         `json:"Command"`
		Comment     string         `json:"Comment"`
		DependsOn   []ComponentKey `json:"DependsOn"`
		Destination string         `json:"Destination"`
		Direction   string         `json:"Direction"`
		Hex         bool           `json:"Hex"`
		Key         string         `json:"Key"`
		Link        string         `json:"Link"`
		LocalPort   uint           `json:"LocalPort"`
		Name        string         `json:"Name"`
		Path        string         `json:"Path"`
		ProductID   string         `json:"ProductId"`
		Protocol    string         `json:"Protocol"`
		SHA512      string         `json:"sha512"`
		Source      string         `json:"Source"`
		StartupType string         `json:"StartupType"`
		State       string         `json:"State"`
		Target      string         `json:"Target"`
		URL         string         `json:"Url"`
		Value       string         `json:"Value"`
		// Using 'string' type for ValueData is broken for win10 worker types
		// at the moment which are sometimes storing an int rather than a
		// string. Conversion to a hex did not work - see
		// https://github.com/mozilla-releng/OpenCloudConfig/pull/108 and
		// https://github.com/mozilla-releng/OpenCloudConfig/commit/801ef77f468b7e6bc5778a7e231f196af17fee65
		// for details. The ValueData is used in OCC components
		// RegistryValueSet and RegistryKeySet which are essentially wrappers
		// around
		// https://docs.microsoft.com/en-us/powershell/dsc/registryresource .
		// Need to experiment if these docs are correct and evaluate if
		// string/[]string/something else is really required. Also need to make
		// sure "Hex" property is respected in "RegistryKeySet" and
		// "RegistryValueSet" and find out why it was failing prior to
		// https://github.com/mozilla-releng/OpenCloudConfig/commit/801ef77f468b7e6bc5778a7e231f196af17fee65
		ValueData interface{} `json:"ValueData"`
		ValueName string      `json:"ValueName"`
		ValueType string      `json:"ValueType"`
		Values    []string    `json:"Values"`
	}
	ComponentKey struct {
		ComponentName string `json:"ComponentName"`
		ComponentType string `json:"ComponentType"`
	}
)

func (c ComponentKey) String() string {
	return fmt.Sprintf("{ComponentName: '%v', ComponentType: '%v'}", c.ComponentName, c.ComponentType)
}

func PSEscape(s string) string {
	return strings.Replace(strings.Replace(s, "`", "``", -1), `"`, "`\"", -1)
}

func main() {
	if len(os.Args) != 2 {
		log.Fatal("Please specify a single workerType, e.g. `transform-occ gecko-1-b-win2012`")
	}
	workerType := os.Args[1]
	log.SetFlags(0)
	log.SetPrefix("ERROR: " + workerType + ": ")
	resp, err := http.Get("https://raw.githubusercontent.com/mozilla-releng/OpenCloudConfig/master/userdata/Manifest/" + workerType + ".json")
	if err != nil {
		log.Fatalf("%v", err)
	}
	defer resp.Body.Close()
	dec := json.NewDecoder(resp.Body)
	dec.DisallowUnknownFields()
	var o OCCManifest
	err = dec.Decode(&o)
	if err != nil {
		log.Fatalf("%v", err)
	}

	orderedComponents, err := OrderComponents(o.Components)
	if err != nil {
		log.Fatalf("%v", err)
	}

	fmt.Println(`<powershell>`)
	fmt.Println(``)
	fmt.Println(`# use TLS 1.2 (see bug 1443595)`)
	fmt.Println(`[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12`)
	fmt.Println(``)
	fmt.Println(`# capture env`)
	fmt.Println(`Get-ChildItem Env: | Out-File "C:\install_env.txt"`)
	fmt.Println(``)
	fmt.Println(`# needed for making http requests`)
	fmt.Println(`$client = New-Object system.net.WebClient`)
	fmt.Println(`$shell = new-object -com shell.application`)
	fmt.Println(``)
	fmt.Println(`# utility function to download a zip file and extract it`)
	fmt.Println(`function Extract-ZIPFile($file, $destination, $url)`)
	fmt.Println(`{`)
	fmt.Println(`    $client.DownloadFile($url, $file)`)
	fmt.Println(`    $zip = $shell.NameSpace($file)`)
	fmt.Println(`    foreach($item in $zip.items())`)
	fmt.Println(`    {`)
	fmt.Println(`        $shell.Namespace($destination).copyhere($item)`)
	fmt.Println(`    }`)
	fmt.Println(`}`)
	fmt.Println(``)
	fmt.Println(`md C:\logs`)
	fmt.Println(`md C:\binaries`)

	for _, c := range orderedComponents {
		fmt.Println("")
		if c.Comment != "" {
			fmt.Println("# " + c.ComponentName + ": " + c.Comment)
		} else {
			fmt.Println("# " + c.ComponentName)
		}
		switch c.ComponentType {
		case "ChecksumFileDownload":
			fmt.Printf(`$client.DownloadFile("%s", "%s")`+"\n", c.Source, c.Target)
		case "CommandRun":
			fmt.Printf(`Start-Process "%s" -ArgumentList "%s" -Wait -NoNewWindow`+"\n", c.Command, PSEscape(strings.Join(c.Arguments, " ")))
		case "DirectoryCreate":
			fmt.Printf(`md "%s"`+"\n", c.Path)
		case "DisableIndexing":
			fmt.Print(`Get-WmiObject Win32_Volume -Filter "IndexingEnabled=$true" | Set-WmiInstance -Arguments @{IndexingEnabled=$false}` + "\n")
		case "EnvironmentVariableSet":
			fmt.Printf(`[Environment]::SetEnvironmentVariable("%s", "%s", "%s")`+"\n", c.Name, c.Value, c.Target)
		case "EnvironmentVariableUniquePrepend":
			fmt.Printf(`[Environment]::SetEnvironmentVariable("%s", "%s;%%%s%%", "%s")`+"\n", c.Name, strings.Join(c.Values, ";"), c.Name, c.Target)
		case "ExeInstall":
			filename := FilenameFromURL(c.URL, ".exe")
			fmt.Printf(`$client.DownloadFile("%s", "C:\binaries\%v")`+"\n", c.URL, filename)
			fmt.Printf(`Start-Process "C:\binaries\%v" -ArgumentList "%s" -Wait -NoNewWindow`+"\n", filename, PSEscape(strings.Join(c.Arguments, " ")))
		case "FileDownload":
			fmt.Printf(`$client.DownloadFile("%s", "%s")`+"\n", c.Source, c.Target)
		case "FirewallRule":
			fmt.Printf(`New-NetFirewallRule -DisplayName "%v (%v %v %v): %v" -Direction %v -LocalPort %v -Protocol %v -Action %v`+"\n", c.ComponentName, c.Protocol, c.LocalPort, c.Direction, c.Action, c.Direction, c.LocalPort, c.Protocol, c.Action)
		case "MsiInstall":
			filename := FilenameFromURL(c.URL, ".msi")
			fmt.Printf(`$client.DownloadFile("%v", "C:\binaries\%v")`+"\n", c.URL, filename)
			fmt.Printf(`Start-Process "msiexec" -ArgumentList "/i C:\binaries\%v /quiet" -Wait -NoNewWindow`+"\n", filename)
		case "MsuInstall":
			filename := FilenameFromURL(c.URL, ".msu")
			fmt.Printf(`$client.DownloadFile("%v", "C:\binaries\%v")`+"\n", c.URL, filename)
			fmt.Printf(`Start-Process "wusa" -ArgumentList "C:\binaries\%v /quiet /norestart" -Wait -NoNewWindow`+"\n", filename)
		case "RegistryKeySet":
			fmt.Printf(`New-Item -Path "%v" -Force`+"\n", PSPath(c.Key+`\`+c.ValueName))
		case "RegistryValueSet":
			fmt.Printf(`New-ItemProperty -Path "%v" -Name "%v" -Value "%v" -PropertyType %v -Force`+"\n", PSPath(c.Key), c.ValueName, c.ValueData, c.ValueType)
		case "ServiceControl":
			fmt.Printf(`Set-Service "%v" -StartupType %v -Status %v`+"\n", c.Name, c.StartupType, c.State)
		case "SymbolicLink":
			fmt.Printf(`cmd /c mklink "%v" "%v"`+"\n", c.Link, c.Target)
		case "WindowsFeatureInstall":
			fmt.Printf(`Install-WindowsFeature %v`+"\n", c.Name)
		case "ZipInstall":
			filename := FilenameFromURL(c.URL, ".zip")
			fmt.Printf(`New-Item -ItemType Directory -Force -Path "%v"`+"\n", c.Destination)
			fmt.Printf(`Extract-ZIPFile -File "C:\binaries\%v" -Destination "%v" -Url "%v"`+"\n", filename, c.Destination, c.URL)
		default:
			log.Fatalf("Do not know how to convert component type '%v' into raw powershell code", c.ComponentType)
		}
	}
	fmt.Println("")
	fmt.Println("# now shutdown, in preparation for creating an image")
	fmt.Println("# Stop-Computer isn't working, also not when specifying -AsJob, so reverting to using `shutdown` command instead")
	fmt.Println("#   * https://www.reddit.com/r/PowerShell/comments/65250s/windows_10_creators_update_stopcomputer_not/dgfofug/?st=j1o3oa29&sh=e0c29c6d")
	fmt.Println("#   * https://support.microsoft.com/en-in/help/4014551/description-of-the-security-and-quality-rollup-for-the-net-framework-4")
	fmt.Println("#   * https://support.microsoft.com/en-us/help/4020459")
	fmt.Println("shutdown -s")
	fmt.Println("")
	fmt.Println("</powershell>")
}

func FilenameFromURL(url string, extension string) (filename string) {
	stripFromPath := func(url string, extension string) (filename string) {
		filename = path.Base(url)
		unescaped, err := pkgurl.QueryUnescape(filename)
		if err == nil {
			filename = unescaped
		}
		if strings.HasSuffix(strings.ToLower(filename), strings.ToLower(extension)) {
			return filename
		}
		return ""
	}

	if firstTry := stripFromPath(url, extension); firstTry != "" {
		return firstTry
	}

	// URL provided does not have filename explicitly in it, so next strategy
	// to obtain the filename is to make an http request to the url, and keep
	// following http redirects until a url is found that filename can be
	// extracted from.
	client := http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			url = req.URL.String()
			filename = stripFromPath(url, extension)
			if filename != "" {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}
	_, err := client.Head(url)
	if err != nil {
		log.Fatal("Could not reach URL " + url)
	}
	if filename == "" {
		log.Fatalf("FAIL: Got empty filename for content from url %v with extension %v - cannot proceed!", url, extension)
	}
	return
}

// PSPath takes a fully qualified registry path, and returns the powershell path representation.
//  `HKEY_CURRENT_USER\<x>` -> `HKCU:<x>`
//  `HKEY_LOCAL_MACHINE\<x>` -> `HKLM:<x>`
// If path does not match one of these expressions, it will be returned unaltered.
func PSPath(path string) string {
	psPath := path
	for i, j := range map[string]string{
		`HKEY_CURRENT_USER\`:  `HKCU:`,
		`HKEY_LOCAL_MACHINE\`: `HKLM:`,
	} {
		if strings.HasPrefix(path, i) {
			psPath = j + path[len(i):]
			break
		}
	}
	return psPath
}

type DependencyDoesNotExist struct {
	ComponentKey  ComponentKey
	Dependency    ComponentKey
	ComponentList []Component
}

func (d *DependencyDoesNotExist) Error() string {
	return fmt.Sprintf("Component %v depends on %v which is not defined in component list", d.ComponentKey, d.Dependency)
}

type DuplicateComponentKey struct {
	Key           ComponentKey
	ComponentList []Component
}

func (d *DuplicateComponentKey) Error() string {
	return fmt.Sprintf("Duplicate component key found: %v", d.Key)
}

type CyclicDependency struct {
	Key           ComponentKey
	Chain         []ComponentKey
	ComponentList []Component
}

func (d *CyclicDependency) Error() string {
	keyStrings := make([]string, len(d.Chain), len(d.Chain))
	for i, key := range d.Chain {
		keyStrings[i] = key.String()
	}
	return "Cyclic dependency found in component list: " + strings.Join(keyStrings, " -> ") + " -> " + d.Key.String()
}

// OrderComponents will return a sorted copy of comps such that dependencies of
// a component appear earlier in the list than the component itself. Returns an
// error if there is a cyclic dependency, or if comps contains non-unique
// component keys, or if a component refers to a dependency which is not in the
// list.
func OrderComponents(comps []Component) (ordered []Component, err error) {
	ordered = make([]Component, len(comps), len(comps))
	i := 0
	addedKeys := map[ComponentKey]bool{}
	compByKey := map[ComponentKey]Component{}
	for _, c := range comps {
		key := ComponentKey{ComponentName: c.ComponentName, ComponentType: c.ComponentType}
		if _, exists := compByKey[key]; exists {
			return nil, &DuplicateComponentKey{
				ComponentList: comps,
				Key:           key,
			}
		}
		compByKey[key] = c
	}
	for key, comp := range compByKey {
		for _, dependency := range comp.DependsOn {
			if _, exists := compByKey[dependency]; !exists {
				return nil, &DependencyDoesNotExist{
					ComponentKey:  key,
					Dependency:    dependency,
					ComponentList: comps,
				}
			}
		}
	}
	var add func(key ComponentKey, dependencyChain []ComponentKey) error
	add = func(key ComponentKey, dependencyChain []ComponentKey) error {
		if !addedKeys[key] {
			// maintaining a map of keys may have been more efficient, but would require more complex code
			// so just loop through all keys in dependency chain for now
			for _, k := range dependencyChain {
				if key == k {
					return &CyclicDependency{
						Key:           key,
						Chain:         dependencyChain,
						ComponentList: comps,
					}
				}
			}
			dependencyChain = append(dependencyChain, key)
			for _, d := range compByKey[key].DependsOn {
				err = add(d, dependencyChain)
				if err != nil {
					return err
				}
			}
			ordered[i] = compByKey[key]
			addedKeys[key] = true
			i++
		}
		return nil
	}
	for _, c := range comps {
		key := ComponentKey{ComponentName: c.ComponentName, ComponentType: c.ComponentType}
		err = add(key, []ComponentKey{})
		if err != nil {
			return nil, err
		}
	}
	return
}
