import React, { Component } from 'react';
import { filter, map, pipe, sort as rSort } from 'ramda';
import sort from '../../../utils/sort';
import Entry from './Entry';
import HeaderWithAnchor from '../components/HeaderWithAnchor';
import references from '../../../../../generated/references.json';

const filteredSchemas = pipe(
  filter(entry => entry.filename.startsWith('schemas/')),
  map(entry => entry)
);
const sortSchemas = pipe(
  rSort((a, b) => sort(a.content.$id, b.content.$id)),
  map(entry => entry)
);

export default class SchemaIndex extends Component {
  render() {
    const sortedReferences = sortSchemas(filteredSchemas(references));

    return (
      <div>
        <HeaderWithAnchor>Schema Index</HeaderWithAnchor>
        {sortedReferences.map(entry => (
          <Entry
            key={entry.content.$id}
            serviceName="unknown"
            type="schema"
            entry={entry}
          />
        ))}
      </div>
    );
  }
}
