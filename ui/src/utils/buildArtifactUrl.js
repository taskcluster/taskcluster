import getIconFromMime from './getIconFromMime';
import urls from './urls';

export default ({ name, contentType, namespace, url }) => {
  if (/^public\//.test(name)) {
    const icon = getIconFromMime(contentType);

    // If we have a namespace, use a URL with that namespace to make it
    // easier for users to copy/paste index URLs
    if (namespace) {
      return {
        icon,
        name,
        url: urls.api('index', 'v1', `task/${namespace}/artifacts/${name}`),
      };
    }

    return {
      icon,
      name,
      url,
    };
  }

  return {
    name,
    url,
  };
};
