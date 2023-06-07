module.exports = {
  Query: {
    githubRepository(parent, { owner, repo }, { loaders }) {
      return loaders.githubRepository.load({ owner, repo });
    },
    renderTaskclusterYml(parent, payload, { loaders }) {
      return loaders.renderTaskclusterYml.load(payload);
    },
  },
};
