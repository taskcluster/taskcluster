import React, { Component, Fragment } from 'react';
import { string } from 'prop-types';
import { withRouter } from 'react-router-dom';
import sortBy from 'lodash/sortBy';
import filter from 'lodash/filter';
import SchemaPanel from './SchemaPanel';
import HeaderWithAnchor from '../components/HeaderWithAnchor';
import references from '../../../../../generated/references.json';

@withRouter
export default class SchemaIndex extends Component {
  static propTypes = {
    // the service name to document
    serviceName: string.isRequired,
    // the version of that service to document
    apiVersion: string.isRequired,
  };

  // Filters only schemas, sorted by $id
  getSortedReferences = () => {
    const sortedReferences = filter(references, entry =>
      entry.filename.startsWith('schemas/')
    );

    return sortBy(sortedReferences, ['content.$id']);
  };

  render() {
    const { serviceName } = this.props;
    const sortedReferences = this.getSortedReferences();

    return (
      <div>
        <HeaderWithAnchor>Schema Index</HeaderWithAnchor>
        <Fragment>
          {sortedReferences.map(entry => (
            <SchemaPanel
              key={entry.content.$id}
              serviceName={serviceName}
              type="schema"
              entry={entry}
            />
          ))}
        </Fragment>
      </div>
    );
  }
}
