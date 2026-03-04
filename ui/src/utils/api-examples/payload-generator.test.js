import generatePayloadExample from './payload-generator';

describe('generatePayloadExample', () => {
  describe('basic types', () => {
    test('generates string examples', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result).toHaveProperty('name');
      expect(typeof result.name).toBe('string');
    });

    test('generates number examples', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          count: { type: 'integer' },
          score: { type: 'number' },
        },
        required: ['count', 'score'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('score');
      expect(Number.isInteger(result.count)).toBe(true);
      expect(typeof result.score).toBe('number');
    });

    test('generates boolean examples', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
        },
        required: ['enabled'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result).toHaveProperty('enabled');
      expect(typeof result.enabled).toBe('boolean');
    });

    test('generates array examples', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['tags'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result).toHaveProperty('tags');
      expect(Array.isArray(result.tags)).toBe(true);
    });

    test('generates nested object examples', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              setting: { type: 'string' },
            },
            required: ['setting'],
          },
        },
        required: ['config'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result).toHaveProperty('config');
      expect(result.config).toHaveProperty('setting');
      expect(typeof result.config.setting).toBe('string');
    });
  });

  describe('Taskcluster-specific placeholders', () => {
    test('generates taskId placeholder for string type', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          taskId: { type: 'string' },
        },
        required: ['taskId'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result.taskId).toBe('dSlITZ4yQgmvxxAi4A8fHQ');
    });

    test('does not apply taskId placeholder to object type', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          task: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
            required: ['id'],
          },
        },
        required: ['task'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result.task).toBeInstanceOf(Object);
      expect(result.task).toHaveProperty('id');
    });

    test('generates workerPoolId placeholder for string type', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          workerPoolId: { type: 'string' },
        },
        required: ['workerPoolId'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result.workerPoolId).toBe('my-worker-pool');
    });

    test('does not apply workerPoolId placeholder to object type', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          workerPool: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
            required: ['id'],
          },
        },
        required: ['workerPool'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result.workerPool).toBeInstanceOf(Object);
      expect(result.workerPool).toHaveProperty('id');
    });
  });

  describe('$ref resolution', () => {
    test('resolves internal $ref', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        definitions: {
          person: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
        properties: {
          owner: { $ref: '#/definitions/person' },
        },
        required: ['owner'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result).toHaveProperty('owner');
      expect(result.owner).toHaveProperty('name');
      expect(typeof result.owner.name).toBe('string');
    });

    test('resolves external $ref', () => {
      const personSchema = {
        $id: '/schemas/person.json',
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
        required: ['name'],
      };
      const taskSchema = {
        $id: '/schemas/task.json',
        type: 'object',
        properties: {
          owner: { $ref: 'person.json' },
        },
        required: ['owner'],
      };
      const result = generatePayloadExample(taskSchema, [
        { content: personSchema },
        { content: taskSchema },
      ]);

      expect(result).toHaveProperty('owner');
      expect(result.owner).toHaveProperty('name');
      expect(typeof result.owner.name).toBe('string');
    });

    test('resolves external $ref with path', () => {
      const definitionsSchema = {
        $id: '/schemas/definitions.json',
        definitions: {
          metadata: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              version: { type: 'integer' },
            },
            required: ['title'],
          },
        },
      };
      const taskSchema = {
        $id: '/schemas/task.json',
        type: 'object',
        properties: {
          metadata: { $ref: 'definitions.json#/definitions/metadata' },
        },
        required: ['metadata'],
      };
      const result = generatePayloadExample(taskSchema, [
        { content: definitionsSchema },
        { content: taskSchema },
      ]);

      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('title');
      expect(typeof result.metadata.title).toBe('string');
    });

    test('handles nested $refs', () => {
      const addressSchema = {
        $id: '/schemas/address.json',
        type: 'object',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
        },
        required: ['city'],
      };
      const personSchema = {
        $id: '/schemas/person.json',
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: { $ref: 'address.json' },
        },
        required: ['name', 'address'],
      };
      const taskSchema = {
        $id: '/schemas/task.json',
        type: 'object',
        properties: {
          owner: { $ref: 'person.json' },
        },
        required: ['owner'],
      };
      const result = generatePayloadExample(taskSchema, [
        { content: addressSchema },
        { content: personSchema },
        { content: taskSchema },
      ]);

      expect(result).toHaveProperty('owner');
      expect(result.owner).toHaveProperty('name');
      expect(result.owner).toHaveProperty('address');
      expect(result.owner.address).toHaveProperty('city');
    });

    test('handles circular $refs without infinite loop', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          name: { type: 'string' },
          parent: { $ref: '#' },
        },
        required: ['name'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result).toHaveProperty('name');
      // Should not crash, circular reference should be handled
    });

    test('resolves $ref that itself contains a $ref', () => {
      const baseSchema = {
        $id: '/schemas/base.json',
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      };
      const midSchema = {
        $id: '/schemas/mid.json',
        $ref: 'base.json',
      };
      const topSchema = {
        $id: '/schemas/top.json',
        type: 'object',
        properties: {
          item: { $ref: 'mid.json' },
        },
        required: ['item'],
      };
      const result = generatePayloadExample(topSchema, [
        { content: baseSchema },
        { content: midSchema },
        { content: topSchema },
      ]);

      expect(result).toHaveProperty('item');
      expect(result.item).toHaveProperty('id');
    });
  });

  describe('schema keywords', () => {
    test('uses default values', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          status: { type: 'string', default: 'pending' },
          priority: { type: 'integer', default: 5 },
        },
        required: ['status', 'priority'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result.status).toBe('pending');
      expect(result.priority).toBe(5);
    });

    test('uses enum values', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['debug', 'info', 'error'] },
        },
        required: ['level'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(['debug', 'info', 'error']).toContain(result.level);
    });

    test('handles oneOf by picking first option', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          value: {
            oneOf: [{ type: 'string' }, { type: 'integer' }],
          },
        },
        required: ['value'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result).toHaveProperty('value');
      // Should pick first option (string)
      expect(typeof result.value).toBe('string');
    });

    test('handles anyOf by picking first option', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          value: {
            anyOf: [{ type: 'number' }, { type: 'string' }],
          },
        },
        required: ['value'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result).toHaveProperty('value');
      // Should pick first option (number)
      expect(typeof result.value).toBe('number');
    });

    test('handles allOf by merging schemas', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          item: {
            allOf: [
              {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                },
                required: ['name'],
              },
              {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                },
                required: ['id'],
              },
            ],
          },
        },
        required: ['item'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result).toHaveProperty('item');
      expect(result.item).toHaveProperty('name');
      expect(result.item).toHaveProperty('id');
    });
  });

  describe('edge cases', () => {
    test('handles null schema', () => {
      const result = generatePayloadExample(null, []);

      expect(result).toBeNull();
    });

    test('handles empty allSchemas array', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };
      const result = generatePayloadExample(schema, []);

      expect(result).toHaveProperty('name');
    });

    test('handles schema without required properties', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      expect(result).toBeInstanceOf(Object);
    });

    test('returns null for unresolvable $ref', () => {
      const schema = {
        $id: '/test-schema.json',
        type: 'object',
        properties: {
          item: { $ref: 'non-existent.json' },
        },
        required: ['item'],
      };
      const result = generatePayloadExample(schema, [{ content: schema }]);

      // Should handle gracefully without crashing
      expect(result).toBeDefined();
    });
  });
});
