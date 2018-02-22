import { makeExecutableSchema, mergeSchemas } from 'graphql-tools';
import merge from 'deepmerge';

export default class Schema {
  constructor() {
    this.typeDefs = new Set();
    this.resolvers = {};
    this.mergeableResolvers = [];
  }

  use(source) {
    if (source.typeDefs) {
      this.typeDefs.add(source.typeDefs);
    }

    if (source.resolvers) {
      if (typeof source.resolvers === 'function') {
        this.mergeableResolvers.push(source.resolvers);
      } else {
        this.resolvers = merge(this.resolvers, source.resolvers);
      }
    }

    return this;
  }

  output() {
    const schema = makeExecutableSchema({
      typeDefs: [...this.typeDefs],
      resolvers: { ...this.resolvers },
    });

    return this.mergeableResolvers.reduce(
      (schema, resolvers) =>
        mergeSchemas({
          schemas: [schema],
          resolvers,
        }),
      schema
    );
  }
}
