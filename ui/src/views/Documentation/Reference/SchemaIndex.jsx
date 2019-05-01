import React, { Component, Fragment } from 'react';
import { withRouter } from 'react-router-dom';
import sortBy from 'lodash/sortBy';
import filter from 'lodash/filter';
import Entry from './Entry';
import HeaderWithAnchor from '../components/HeaderWithAnchor';
import references from '../../../../../generated/references.json';

@withRouter
export default class SchemaIndex extends Component {
  // Filters only schemas, sorted by $id
  getSortedReferences = () => {
    const sortedReferences = filter(references, entry =>
      entry.filename.startsWith('schemas/')
    );

    return sortBy(sortedReferences, ['content.$id']);
  };

  render() {
    const sortedReferences = this.getSortedReferences();

    return (
      <div>
        <HeaderWithAnchor>Schema Index</HeaderWithAnchor>
        <Fragment>
          {sortedReferences.map(entry => (
            <Entry
              key={entry.content.$id}
              serviceName="unknown"
              type="schema"
              entry={entry}
            />
          ))}
        </Fragment>
      </div>
    );
  }
}
