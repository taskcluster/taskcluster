package org.mozilla.taskcluster.urls;

import java.util.Map;
import lombok.Data;

@Data
public class TestCase {
    private String              function;
    private Map<String, String> expected;
    private String[][]          argSets;
}
