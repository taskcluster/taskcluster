import React, { Component, Fragment } from 'react';
import { string } from 'prop-types';
import { withRouter } from 'react-router-dom';
import MDX from '@mdx-js/runtime';
import Typography from '@material-ui/core/Typography';
import Entry from './Entry';
import components from '../components';
import HeaderWithAnchor from '../components/HeaderWithAnchor';
import Anchor from '../components/Anchor';
import findRefDoc from '../../../utils/findRefDoc';

@withRouter
export default class ApiReference extends Component {
  static propTypes = {
    // the service name to document
    serviceName: string.isRequired,
    // the version of that service to document
    apiVersion: string.isRequired,
  };

  groupBy = (list, keyGetter) => {
    const map = new Map();

    list.forEach(item => {
      const key = keyGetter(item);
      const collection = map.get(key);

      if (!collection) {
        map.set(key, [item]);
      } else {
        collection.push(item);
      }
    });

    return map;
  };

  render() {
    const { serviceName, apiVersion } = this.props;
    const { ref, version } = findRefDoc({
      type: 'api',
      serviceName,
      apiVersion,
    });

    if (version !== 0) {
      throw new Error(`Reference document version ${version} not supported`);
    }

    const functionEntries =
      ref.entries && ref.entries.filter(({ type }) => type === 'function');
    const groupedEntries = Array.from(
      this.groupBy(functionEntries, entry => entry.category)
    );

    return (
      <div>
        {ref.title && <HeaderWithAnchor>{ref.title}</HeaderWithAnchor>}
        {ref.description && (
          <MDX components={components}>{ref.description}</MDX>
        )}
        {functionEntries && Boolean(functionEntries.length) && (
          <Fragment>
            <HeaderWithAnchor type="h3">Functions</HeaderWithAnchor>
            <Typography variant="body2">
              For more information on invoking the API methods described here,
              see{' '}
              <Anchor href="/docs/manual/design/apis">Using the APIs</Anchor> in
              the manual.
            </Typography>
            {groupedEntries.map(group => (
              <Fragment key={group[0]}>
                <HeaderWithAnchor type="h4">{group[0]}</HeaderWithAnchor>
                {group[1].map(entry => (
                  <Entry
                    key={`${entry.name}-${entry.query}`}
                    type="function"
                    entry={entry}
                    serviceName={ref.serviceName}
                    apiVersion={ref.apiVersion}
                  />
                ))}
              </Fragment>
            ))}
          </Fragment>
        )}
      </div>
    );
  }
}
