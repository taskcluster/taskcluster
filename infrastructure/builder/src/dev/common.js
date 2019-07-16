module.exports = ({userConfig, prompts, configTmpl}) => {

  prompts.push({
    type: 'input',
    when: () => !userConfig.rootUrl,
    name: 'rootUrl',
    message: 'What is the root url you will use for this deployment?',
    filter: rootUrl => {
      if (!rootUrl.endsWith('/')) {
        rootUrl = rootUrl + '/';
      }
      if (!rootUrl.includes('://')) {
        rootUrl = 'https://' + rootUrl;
      }
      return rootUrl;
    },
    validate: rootUrl => {
      let url;
      try {
        url = new URL(rootUrl);
      } catch (err) {
        return `${rootUrl} is not a valid URL`;
      }
      if (url.protocol !== 'https:') {
        return 'root url must be https';
      }
      return true;
    },
  });

  prompts.push({
    type: 'input',
    when: () => !userConfig.ui || !userConfig.ui.application_name,
    name: 'ui.application_name',
    message: 'What human-readable name will your deployment have?',
  });
};
