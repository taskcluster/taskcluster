import React, { Component, Fragment } from 'react';
import { string } from 'prop-types';
import { withRouter } from 'react-router-dom';
import MDX from '@mdx-js/runtime';
import Entry from './Entry';
import components from '../components';
import HeaderWithAnchor from '../components/HeaderWithAnchor';
import findRefDoc from '../../../utils/findRefDoc';

@withRouter
export default class ExchangesReference extends Component {
  static propTypes = {
    // the service name to document
    serviceName: string.isRequired,
    // the version of that service to document
    apiVersion: string.isRequired,
  };

  render() {
    const { serviceName, apiVersion } = this.props;
    const { ref, version } = findRefDoc({
      type: 'exchanges',
      serviceName,
      apiVersion,
    });

    if (version !== 0) {
      throw new Error(`Reference document version ${version} not supported`);
    }

    const topicExchangeEntries =
      ref.entries &&
      ref.entries.filter(({ type }) => type === 'topic-exchange');

    return (
      <div>
        {ref.title && <HeaderWithAnchor>{ref.title}</HeaderWithAnchor>}
        {ref.description && (
          <MDX components={components}>{ref.description}</MDX>
        )}
        {topicExchangeEntries && Boolean(topicExchangeEntries.length) && (
          <Fragment>
            <HeaderWithAnchor type="h3">Exchanges</HeaderWithAnchor>
            {topicExchangeEntries.map(entry => (
              <Entry
                key={entry.name}
                type="topic-exchange"
                entry={entry}
                exchangePrefix={ref.exchangePrefix}
                serviceName={ref.serviceName}
              />
            ))}
          </Fragment>
        )}
      </div>
    );
  }
}
