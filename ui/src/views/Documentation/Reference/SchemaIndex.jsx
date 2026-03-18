import { filter, map, pipe, sort as rSort } from 'ramda';
import { Component } from 'react';
import references from '../../../../../generated/references.json';
import sort from '../../../utils/sort';
import HeaderWithAnchor from '../components/HeaderWithAnchor';
import Entry from './Entry';

const filteredSchemas = pipe(
  filter((entry) => entry.filename.startsWith('schemas/')),
  map((entry) => entry),
);
const sortSchemas = pipe(
  rSort((a, b) => sort(a.content.$id, b.content.$id)),
  map((entry) => entry),
);

export default class SchemaIndex extends Component {
  render() {
    const sortedReferences = sortSchemas(filteredSchemas(references));

    return (
      <div>
        <HeaderWithAnchor>Schema Index</HeaderWithAnchor>
        {sortedReferences.map((ref) => (
          <Entry
            key={ref.content.$id}
            type="schema"
            entry={{
              $id: ref.content.$id,
              schema: ref.content,
            }}
          />
        ))}
      </div>
    );
  }
}
