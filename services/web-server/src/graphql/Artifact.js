export const typeDefs = `
  type Artifact {
    taskId: String!
    runId: Int!
    storageType: ArtifactStorageType!
    name: String!
    expires: Date!
    contentType: String!
    url: String
  }
  
  enum ArtifactStorageType {
    BLOB
    S3
    AZURE
    REFERENCE
    ERROR
  }
  
  extend type Query {
    artifact(taskId: String!, runId: Int!, name: String!): Artifact
    artifacts(taskId: String!, runId: Int!): [Artifact]
  }
`;

export const resolvers = {
  ArtifactStorageType: {
    BLOB: 'blob',
    S3: 's3',
    AZURE: 'azure',
    REFERENCE: 'reference',
    ERROR: 'error',
  },
  Query: {
    artifact: (parent, args, { loaders }) => loaders.artifact.load(args),
    artifacts: (parent, args, { loaders }) => loaders.artifacts.load(args),
  },
};
