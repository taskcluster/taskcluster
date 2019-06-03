package org.mozilla.taskcluster.urls;

public interface URLProvider {

    /**
     * Generate URL for path in a Taskcluster service.
     */
    public String api(String service, String version, String path);

    /**
     * Generate URL for the api reference of a Taskcluster service.
     */
    public String apiReference(String service, String version);

    /**
     * Generate URL for path in the Taskcluster docs website.
     */
    public String docs(String path);

    /**
     * Generate URL for the exchange reference of a Taskcluster service.
     */
    public String exchangeReference(String service, String version);

    /**
     * Generate URL for the schemas of a Taskcluster service.
     * The schema usually have the version in its name i.e. "v1/whatever.json"
     */
    public String schema(String service, String schema);

    /**
     * Generate URL for the api reference schema
     */
    public String apiReferenceSchema(String version);

    /**
     * Generate URL for the exchanges reference schema
     */
    public String exchangesReferenceSchema(String version);

    /**
     * Generate URL for the api manifest schema
     */
    public String apiManifestSchema(String version);

    /**
     * Generate URL for the metadata metaschema
     */
    public String metadataMetaschema();

    /**
     * Generate URL for Taskcluser UI. The purpose of the function is to switch on rootUrl:
     * "The driver for having a ui method is so we can just call ui with a path and any root url, 
     *  and the returned url should work for both our current deployment (with root URL = https://taskcluster.net) 
     *  and any future deployment. The returned value is essentially rootURL == 'https://taskcluster.net' 
     *  ? 'https://tools.taskcluster.net/${path}' 
     *  : '${rootURL}/${path}'. "
     *
     * @param path - may or may not have an initial slash
     */
    public String ui(String path);

    /**
     * Returns a URL for the service manifest of a taskcluster deployment.
     */
    public String apiManifest();
}
