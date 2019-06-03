package org.mozilla.taskcluster.urls;

public class URLs {

    public static final String TASKCLUSTER_NET = "https://taskcluster.net";

    private URLs() {
    }

    public static URLProvider provider(String rootURL) {
        if (Clean.url(rootURL).equals(URLs.TASKCLUSTER_NET)) {
            return new LegacyURLs();
        }
        return new NewURLs(rootURL);
    }
}
