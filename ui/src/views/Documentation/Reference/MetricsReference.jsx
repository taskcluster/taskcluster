import React, { Component, Fragment } from 'react';
import { string } from 'prop-types';
import { withRouter } from 'react-router-dom';
import MDX from '@mdx-js/runtime';
import Typography from '@material-ui/core/Typography';
import { titleCase } from 'title-case';
import Entry from './Entry';
import Anchor from '../components/Anchor';
import components from '../components';
import HeaderWithAnchor from '../components/HeaderWithAnchor';
import findRefDoc from '../../../utils/findRefDoc';

@withRouter
export default class MetricsReference extends Component {
  static propTypes = {
    serviceName: string.isRequired,
  };

  render() {
    const { serviceName } = this.props;
    const { ref, version } = findRefDoc({ type: 'metrics', serviceName });

    if (version !== 0) {
      throw new Error(`Reference document version ${version} not supported`);
    }

    const serviceMetrics = ref.metrics.filter(m =>
      m.name.startsWith(serviceName.replace('-', '_'))
    );
    const genericMetrics = ref.metrics.filter(
      m => !m.name.startsWith(serviceName.replace('-', '_'))
    );

    return (
      <div>
        {ref.title && <HeaderWithAnchor>{ref.title}</HeaderWithAnchor>}
        {ref.description && (
          <MDX components={components}>{ref.description}</MDX>
        )}
        <Typography variant="body2">
          For more information on how to use metrics, see{' '}
          <Anchor href="/docs/manual/design/metrics">Metrics</Anchor> in the
          manual. <br /> Note: deployments could prefix all metrics.
        </Typography>
        {serviceMetrics && serviceMetrics.length > 0 && (
          <Fragment>
            <HeaderWithAnchor type="h3">
              {`${titleCase(serviceName.replace('-', ' '))} Metrics`}
            </HeaderWithAnchor>
            {serviceMetrics.map(entry => (
              <Entry
                key={entry.name}
                type="metric"
                entry={entry}
                exchangePrefix={ref.exchangePrefix}
                serviceName={ref.serviceName}
              />
            ))}
          </Fragment>
        )}
        {genericMetrics && genericMetrics.length > 0 && (
          <Fragment>
            <HeaderWithAnchor type="h3">Generic Metrics</HeaderWithAnchor>
            {genericMetrics.map(entry => (
              <Entry
                key={entry.name}
                type="metric"
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
