export default {
  Query: {
    githubRepository(_parent, { owner, repo }, { loaders }) {
      return loaders.githubRepository.load({ owner, repo });
    },
    renderTaskclusterYml(_parent, payload, { loaders }) {
      return loaders.renderTaskclusterYml.load(payload);
    },
  },
};
