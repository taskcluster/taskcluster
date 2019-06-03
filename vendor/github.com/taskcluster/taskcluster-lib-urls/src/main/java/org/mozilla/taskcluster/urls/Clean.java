package org.mozilla.taskcluster.urls;

public class Clean {

    private Clean() {
    }

    public static String path(String path) {
        return path.replaceAll("^/*", "");
    }

    public static String url(String url) {
        return url.replaceAll("/*$", "");
    }
}
