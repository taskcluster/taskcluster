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

  prompts.push({
    when: () => !userConfig.meta || !userConfig.meta.deploymentPrefix,
    type: 'input',
    name: 'meta.deploymentPrefix',
    message: 'Specify a prefix to use for most resources needed by this cluster.',
    validate: prefix => {
      if (!/^[a-z0-9]+$/.test(prefix)) {
        return 'Must consist of lowercase characters and numbers';
      }
      return true;
    },
  });

  prompts.push({
    when: () => !userConfig.ingressStaticIpName,
    type: 'input',
    name: 'ingressStaticIpName',
    message: 'Name of the google reserved static ip for your cluster.',
  });

  prompts.push({
    when: () => !userConfig.ingressCertName,
    type: 'input',
    name: 'ingressCertName',
    message: 'Name of the google cert for your cluster.',
  });
};
