OLD_ROOT_URL = 'https://taskcluster.net'

def api(root_url, service, version, path):
    """Generate URL for path in a Taskcluster service."""
    root_url = root_url.rstrip('/')
    path = path.lstrip('/')
    if root_url == OLD_ROOT_URL:
        return 'https://{}.taskcluster.net/{}/{}'.format(service, version, path)
    else:
        return '{}/api/{}/{}/{}'.format(root_url, service, version, path)

def api_reference(root_url, service, version):
    """Generate URL for a Taskcluster api reference."""
    root_url = root_url.rstrip('/')
    if root_url == OLD_ROOT_URL:
        return 'https://references.taskcluster.net/{}/{}/api.json'.format(service, version)
    else:
        return '{}/references/{}/{}/api.json'.format(root_url, service, version)

def docs(root_url, path):
    """Generate URL for path in the Taskcluster docs."""
    root_url = root_url.rstrip('/')
    path = path.lstrip('/')
    if root_url == OLD_ROOT_URL:
        return 'https://docs.taskcluster.net/{}'.format(path)
    else:
        return '{}/docs/{}'.format(root_url, path)

def exchange_reference(root_url, service, version):
    """Generate URL for a Taskcluster exchange reference."""
    root_url = root_url.rstrip('/')
    if root_url == OLD_ROOT_URL:
        return 'https://references.taskcluster.net/{}/{}/exchanges.json'.format(service, version)
    else:
        return '{}/references/{}/{}/exchanges.json'.format(root_url, service, version)

def schema(root_url, service, name):
    """Generate URL for a schema in a Taskcluster service."""
    root_url = root_url.rstrip('/')
    name = name.lstrip('/')
    if root_url == OLD_ROOT_URL:
        return 'https://schemas.taskcluster.net/{}/{}'.format(service, name)
    else:
        return '{}/schemas/{}/{}'.format(root_url, service, name)

def api_reference_schema(root_url, version):
    """Generate URL for the api reference schema."""
    return schema(root_url, 'common', 'api-reference-{}.json'.format(version))

def exchanges_reference_schema(root_url, version):
    """Generate URL for the exchanges reference schema."""
    return schema(root_url, 'common', 'exchanges-reference-{}.json'.format(version))

def api_manifest_schema(root_url, version):
    """Generate URL for the api manifest schema"""
    return schema(root_url, 'common', 'manifest-{}.json'.format(version))

def metadata_metaschema(root_url, version):
    """Generate URL for the metadata metaschema"""
    return schema(root_url, 'common', 'metadata-metaschema.json')

def ui(root_url, path):
    """
    Generate URL for a path in the Taskcluster ui.
    The purpose of the function is to switch on rootUrl:
    "The driver for having a ui method is so we can just call ui with a path and any root url,
    and the returned url should work for both our current deployment (with root URL = https://taskcluster.net)
    and any future deployment. The returned value is essentially rootURL == 'https://taskcluster.net'
    'https://tools.taskcluster.net/${path}'
    '${rootURL}/${path}' "
    """
    root_url = root_url.rstrip('/')
    path = path.lstrip('/')
    if root_url == OLD_ROOT_URL:
        return 'https://tools.taskcluster.net/{}'.format(path)
    else:
        return '{}/{}'.format(root_url, path)

def api_manifest(root_url):
    """Returns a URL for the API manifest of a taskcluster deployment."""
    root_url = root_url.rstrip('/')
    if root_url == OLD_ROOT_URL:
        return 'https://references.taskcluster.net/manifest.json'
    else:
        return '{}/references/manifest.json'.format(root_url)

def test_root_url():
    """Returns a standardized "testing" rootUrl that does not resolve but
    is easily recognizable in test failures."""
    return 'https://tc-tests.example.com'
