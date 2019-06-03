const assert = require('assert');

const TASKCLUSTER_NET = 'https://taskcluster.net';

const cleanRoot = rootUrl => rootUrl.replace(/\/*$/, '');
const cleanPath = path => path.replace(/^\/*/, '');

class LegacyUrls {
  /**
   * Generate URL for path in a Taskcluster service.
   */
  api(service, version, path) {
    return `https://${service}.taskcluster.net/${version}/${cleanPath(path)}`;
  }

  /**
   * Generate URL for the api reference of a Taskcluster service.
   */
  apiReference(service, version) {
    return `https://references.taskcluster.net/${service}/${version}/api.json`;
  }

  /**
   * Generate URL for path in the Taskcluster docs website.
   */
  docs(path) {
    return `https://docs.taskcluster.net/${cleanPath(path)}`;
  }

  /**
   * Generate URL for the exchange reference of a Taskcluster service.
   */
  exchangeReference(service, version) {
    return `https://references.taskcluster.net/${service}/${
      version
    }/exchanges.json`;
  }

  /**
   * Generate URL for the schemas of a Taskcluster service.
   * The schema usually have the version in its name i.e. "v1/whatever.json"
   */
  schema(service, schema) {
    return `https://schemas.taskcluster.net/${service}/${cleanPath(schema)}`;
  }

  /**
   * Generate URL for the api reference schema
   */
  apiReferenceSchema(version) {
    return this.schema('common', `api-reference-${version}.json`);
  }

  /**
   * Generate URL for the exchanges reference schema
   */
  exchangesReferenceSchema(version) {
    return this.schema('common', `exchanges-reference-${version}.json`);
  }

  /**
   * Generate URL for the api manifest schema
   */
  apiManifestSchema(version) {
    return this.schema('common', `manifest-${version}.json`);
  }

  /**
   * Generate URL for the metadata metaschema
   */
  metadataMetaschema() {
    return this.schema('common', 'metadata-metaschema.json');
  }

  /**
   * Generate URL for Taskcluser UI.
   */
  ui(path) {
    return `https://tools.taskcluster.net/${cleanPath(path)}`;
  }

  /**
   * Returns a URL for the service manifest of a taskcluster deployment.
   */
  apiManifest() {
    return 'https://references.taskcluster.net/manifest.json';
  }
}

class Urls {
  constructor(rootUrl) {
    this.rootUrl = cleanRoot(rootUrl);
  }

  /**
   * Generate URL for path in a Taskcluster service.
   */
  api(service, version, path) {
    return `${this.rootUrl}/api/${service}/${version}/${cleanPath(path)}`;
  }

  /**
   * Generate URL for the api reference of a Taskcluster service.
   */
  apiReference(service, version) {
    return `${this.rootUrl}/references/${service}/${version}/api.json`;
  }

  /**
   * Generate URL for path in the Taskcluster docs website.
   */
  docs(path) {
    return `${this.rootUrl}/docs/${cleanPath(path)}`;
  }

  /**
   * Generate URL for the exchange reference of a Taskcluster service.
   */
  exchangeReference(service, version) {
    return `${this.rootUrl}/references/${service}/${version}/exchanges.json`;
  }

  /**
   * Generate URL for the schemas of a Taskcluster service.
   * The schema usually have the version in its name i.e. "v1/whatever.json"
   */
  schema(service, schema) {
    return `${this.rootUrl}/schemas/${service}/${cleanPath(schema)}`;
  }

  /**
   * Generate URL for the api reference schema
   */
  apiReferenceSchema(version) {
    return this.schema('common', `api-reference-${version}.json`);
  }

  /**
   * Generate URL for the exchanges reference schema
   */
  exchangesReferenceSchema(version) {
    return this.schema('common', `exchanges-reference-${version}.json`);
  }

  /**
   * Generate URL for the api manifest schema
   */
  apiManifestSchema(version) {
    return this.schema('common', `manifest-${version}.json`);
  }

  /**
   * Generate URL for the metadata metaschema
   */
  metadataMetaschema() {
    return this.schema('common', 'metadata-metaschema.json');
  }

  /**
   * Generate URL for Taskcluser UI.
   */
  ui(path) {
    return `${this.rootUrl}/${cleanPath(path)}`;
  }

  /**
   * Returns a URL for the service manifest of a taskcluster deployment.
   */
  apiManifest() {
    return `${this.rootUrl}/references/manifest.json`;
  }
}

const withRootUrl = rootUrl =>
  cleanRoot(rootUrl) === TASKCLUSTER_NET ?
    new LegacyUrls() :
    new Urls(rootUrl);

module.exports = {
  /**
   * Generate URLs for redeployable services and entities from
   * an initial root URL.
   */
  Urls,

  /**
   * Generate URLs for legacy services and entities like Heroku
   * from an initial root URL.
   */
  LegacyUrls,

  /**
   * Generate URLs for either redeployable or legacy services and entities
   * from an initial root URL.
   */
  withRootUrl,

  /**
   * Generate URL for path in a Taskcluster service.
   */
  api(rootUrl, service, version, path) {
    return withRootUrl(rootUrl).api(service, version, path);
  },

  /**
   * Generate URL for the api reference of a Taskcluster service.
   */
  apiReference(rootUrl, service, version) {
    return withRootUrl(rootUrl).apiReference(service, version);
  },

  /**
   * Generate URL for path in the Taskcluster docs website.
   */
  docs(rootUrl, path) {
    return withRootUrl(rootUrl).docs(path);
  },

  /**
   * Generate URL for the exchange reference of a Taskcluster service.
   */
  exchangeReference(rootUrl, service, version) {
    return withRootUrl(rootUrl).exchangeReference(service, version);
  },

  /**
   * Generate URL for the schemas of a Taskcluster service.
   */
  schema(rootUrl, service, version, schema) {
    return withRootUrl(rootUrl).schema(service, version, schema);
  },

  /**
   * Generate URL for the api reference schema
   */
  apiReferenceSchema(rootUrl, version) {
    return withRootUrl(rootUrl).apiReferenceSchema(version);
  },

  /**
   * Generate URL for the exchanges reference schema
   */
  exchangesReferenceSchema(rootUrl, version) {
    return withRootUrl(rootUrl).exchangesReferenceSchema(version);
  },

  /**
   * Generate URL for the api manifest schema
   */
  apiManifestSchema(rootUrl, version) {
    return withRootUrl(rootUrl).apiManifestSchema(version);
  },

  /**
   * Generate URL for the metadata metaschema
   */
  metadataMetaschema(rootUrl) {
    return withRootUrl(rootUrl).metadataMetaschema();
  },

  /**
   * Generate URL for Taskcluser UI. The purpose of the function is to switch on rootUrl:
   * "The driver for having a ui method is so we can just call ui with a path and any root url, 
   *  and the returned url should work for both our current deployment (with root URL = https://taskcluster.net) 
   *  and any future deployment. The returned value is essentially rootURL == 'https://taskcluster.net' 
   *  ? 'https://tools.taskcluster.net/${path}' 
   *  : '${rootURL}/${path}'. "
   *
   * @param rootUrl - string. Expected to be without a trailing slash
   * @param path - string. The rest of the path to append to the rootUrl.
   * Can start either with a slash or not.
   *
   * @returns string. The resulting url
   */
  ui(rootUrl, path) {
    return withRootUrl(rootUrl).ui(path);
  },

  /**
   * Returns a URL for the service manifest of a taskcluster deployment.
   */
  apiManifest(rootUrl) {
    return withRootUrl(rootUrl).apiManifest();
  },

  /**
   * Return the standardized taskcluster "testing" rootUrl.
   * Useful for nock and such things.
   */
  testRootUrl() {
    return 'https://tc-tests.example.com';
  },
};
