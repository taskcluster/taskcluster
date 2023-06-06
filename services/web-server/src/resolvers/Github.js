module.exports = {
  Query: {
    githubRepository(parent, { owner, repo }, { loaders }) {
      return loaders.githubRepository.load({ owner, repo });
    },
    renderTaskclusterYaml(parent, payload, { loaders }) {
      return loaders.renderTaskclusterYaml.load(payload);
    },
  },
};
