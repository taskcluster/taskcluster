import urlRegex from 'url-regex';

const isUrl = urlRegex({ exact: true });

export default string => isUrl.test(string);
