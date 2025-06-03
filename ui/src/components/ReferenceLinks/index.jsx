import React from 'react';
import { boolean } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Card from '@material-ui/core/Card';
import Typography from '@material-ui/core/Typography';
import { useLocation } from 'react-router-dom';
import Link from '../../utils/Link';

const styles = withStyles(theme => ({
  card: {
    float: 'right',
    padding: theme.spacing(3),
    margin: theme.spacing(2),
  },
  unorderedList: {
    ...theme.mixins.unorderedList,
  },
}));
// A card containing links to the api, log, and exchange references.  This is
// intended only for use in docs/reference/<tier>/<service>/README.mdx, as it
// uses relative links that are only valid from that document.
const ReferenceLinks = ({ classes, api, exchanges, logs, metrics }) => {
  const location = useLocation();

  return (
    <Card raised className={classes.card}>
      <Typography variant="h6">Reference Links</Typography>
      <ul className={classes.unorderedList}>
        {api && (
          <Typography variant="body2" component="li">
            <Link to={`${location.pathname}/api`}>REST API</Link>
          </Typography>
        )}
        {exchanges && (
          <Typography variant="body2" component="li">
            <Link to={`${location.pathname}/exchanges`}>Pulse Exchanges</Link>
          </Typography>
        )}
        {logs && (
          <Typography variant="body2" component="li">
            <Link to={`${location.pathname}/logs`}>Log Messages</Link>
          </Typography>
        )}
        {metrics && (
          <Typography variant="body2" component="li">
            <Link to={`${location.pathname}/metrics`}>Metrics</Link>
          </Typography>
        )}
      </ul>
    </Card>
  );
};

ReferenceLinks.propTypes = {
  // each property is true if a link to that reference should be included
  api: boolean,
  exchanges: boolean,
  logs: boolean,
};

export default styles(ReferenceLinks);
