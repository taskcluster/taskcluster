export default {
  Query: {
    githubRepository(parent, { owner, repo }, { loaders }) {
      return loaders.githubRepository.load({ owner, repo });
    },
  },
};
