package org.mozilla.taskcluster.urls;

import java.util.Map;
import lombok.Data;

@Data
public class TestsSpecification {
    private TestCase[]            tests;
    private Map<String, String[]> rootURLs;
}
