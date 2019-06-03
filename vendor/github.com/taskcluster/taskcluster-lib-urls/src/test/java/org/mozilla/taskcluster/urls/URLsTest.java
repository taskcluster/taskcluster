package org.mozilla.taskcluster.urls;

import java.io.InputStream;
import java.io.IOException;
import java.util.Map;

import org.junit.Assert;
import org.junit.Test;

import org.yaml.snakeyaml.constructor.Constructor;
import org.yaml.snakeyaml.Yaml;

public class URLsTest {

    /**
     * greenTick is an ANSI byte sequence to render a light green tick in a
     * color console.
     */
    private final static byte[] greenTick = new byte[] { 0x1b, 0x5b, 0x33, 0x32, 0x6d, (byte) 0xe2, (byte) 0x9c,
            (byte) 0x93, 0x1b, 0x5b, 0x30, 0x6d };

    /**
     * testURLs iterates through the language-agnostic test cases defined in
     * /tests.yml to ensure that the java implementation returns consistent
     * results with the other language implementations.
     */
    @Test
    public void testURLs() throws Exception {
        Yaml yaml = new Yaml(new Constructor(TestsSpecification.class));
        InputStream inputStream = this.getClass().getClassLoader().getResourceAsStream("tests.yml");
        TestsSpecification spec = yaml.load(inputStream);
        for (TestCase test : spec.getTests()) {
            for (String[] argSet : test.getArgSets()) {
                for (String cluster : spec.getRootURLs().keySet()) {
                    for (String rootURL : spec.getRootURLs().get(cluster)) {
                        this.test(test.getExpected().get(cluster), rootURL, test.getFunction(), argSet);
                    }
                }
            }
        }
    }

    private static void test(String expectedUrl, String rootURL, String methodName, String[] argSet)
            throws NoSuchMethodException, IOException {
        Assert.assertEquals(expectedUrl, testFunc(methodName, URLs.provider(rootURL), argSet));
        System.out.write(greenTick);
        System.out.println(" " + methodName + "(" + quotedList(rootURL, argSet) + ") = " + expectedUrl);
    }

    public static String testFunc(String function, URLProvider urlProvider, String[] args)
            throws NoSuchMethodException {
        switch (function) {
        case "api":
            return urlProvider.api(args[0], args[1], args[2]);
        case "apiReference":
            return urlProvider.apiReference(args[0], args[1]);
        case "docs":
            return urlProvider.docs(args[0]);
        case "exchangeReference":
            return urlProvider.exchangeReference(args[0], args[1]);
        case "schema":
            return urlProvider.schema(args[0], args[1]);
        case "apiReferenceSchema":
            return urlProvider.apiReferenceSchema(args[0]);
        case "exchangesReferenceSchema":
            return urlProvider.exchangesReferenceSchema(args[0]);
        case "apiManifestSchema":
            return urlProvider.apiManifestSchema(args[0]);
        case "metadataMetaschema":
            return urlProvider.metadataMetaschema();
        case "ui":
            return urlProvider.ui(args[0]);
        case "apiManifest":
            return urlProvider.apiManifest();
        default:
            throw new NoSuchMethodException("Unknown function type: " + function);
        }
    }

    private static String quotedList(String rootURL, String[] argSet) {
        String list = "'" + rootURL + "'";
        for (String arg : argSet) {
            list = list + ", '" + arg + "'";
        }
        return list;
    }
}
