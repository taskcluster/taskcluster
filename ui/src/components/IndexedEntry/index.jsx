import React, { Component } from 'react';
import { arrayOf, func, shape } from 'prop-types';
import classNames from 'classnames';
import Code from '@mozilla-frontend-infra/components/Code';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import LockOpenOutlineIcon from 'mdi-react/LockOpenOutlineIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import LockIcon from 'mdi-react/LockIcon';
import ConnectionDataTable from '../ConnectionDataTable';
import DateDistance from '../DateDistance';
import { artifact, indexedTask, date, pageInfo } from '../../utils/prop-types';
import { ARTIFACTS_PAGE_SIZE } from '../../utils/constants';
import Link from '../../utils/Link';
import buildArtifactUrl from '../../utils/buildArtifactUrl';

@withStyles(theme => ({
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
  pointer: {
    cursor: 'pointer',
  },
  linkCell: {
    textAlign: 'right',
  },
  artifactLink: {
    textDecoration: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    verticalAlign: 'middle',
  },
  artifactIcons: {
    marginRight: theme.spacing(1),
  },
  artifactIconWithName: {
    display: 'flex',
    alignItems: 'center',
  },
  latestArtifactsListItem: {
    paddingBottom: 0,
  },
}))
export default class IndexedEntry extends Component {
  static propTypes = {
    indexedTask: indexedTask.isRequired,
    created: date.isRequired,
    latestArtifactsConnection: shape({
      edges: arrayOf(artifact),
      pageInfo,
    }).isRequired,
    onArtifactsPageChange: func.isRequired,
  };

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  loadArtifacts = artifactsConnection => {
    const {
      indexedTask: { taskId, namespace },
    } = this.props;

    if (!taskId || !artifactsConnection.edges.length) {
      return artifactsConnection;
    }

    return {
      ...artifactsConnection,
      edges: artifactsConnection.edges.map(edge => ({
        ...edge,
        node: {
          ...edge.node,
          // Build the URLs here so that they'll be updated when people login
          ...buildArtifactUrl({
            name: edge.node.name,
            contentType: edge.node.contentType,
            url: edge.node.url,
            namespace,
          }),
        },
      })),
    };
  };

  renderArtifactsTable() {
    const {
      classes,
      onArtifactsPageChange,
      latestArtifactsConnection,
    } = this.props;
    const artifacts = this.loadArtifacts(latestArtifactsConnection);

    return (
      <ConnectionDataTable
        connection={artifacts}
        pageSize={ARTIFACTS_PAGE_SIZE}
        columnsSize={3}
        onPageChange={onArtifactsPageChange}
        renderRow={({ node: artifact }) => (
          <TableRow
            key={artifact.name}
            className={classNames(classes.listItemButton, {
              [classes.pointer]: Boolean(artifact.url),
            })}
            hover={Boolean(artifact.url)}>
            <TableCell>
              <Link
                className={classes.artifactLink}
                target="_blank"
                to={artifact.url}>
                <div className={classes.artifactIconWithName}>
                  <div className={classes.artifactIcons}>
                    {artifact.isPublic && <LockOpenOutlineIcon />}
                    {!artifact.isPublic && artifact.url && <LockIcon />}
                    {artifact.icon && <artifact.icon />}
                  </div>
                  {artifact.name}
                </div>
                <div>
                  <OpenInNewIcon />
                </div>
              </Link>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }

  render() {
    const { classes, created, indexedTask } = this.props;

    return (
      <List>
        <ListItem>
          <ListItemText primary="Namespace" secondary={indexedTask.namespace} />
        </ListItem>
        <ListItem>
          <ListItemText primary="Rank" secondary={indexedTask.rank} />
        </ListItem>
        <ListItem>
          <ListItemText
            title={created}
            primary="Created"
            secondary={<DateDistance from={created} />}
          />
        </ListItem>
        <Link to={`/tasks/${indexedTask.taskId}`}>
          <ListItem button className={classes.listItemButton}>
            <ListItemText primary="View task" />
            <LinkIcon />
          </ListItem>
        </Link>
        <ListItem component="div">
          <ListItemText
            primary="Data"
            secondaryTypographyProps={{
              component: 'div',
            }}
            secondary={
              <Code language="json">
                {JSON.stringify(indexedTask.data, null, 2)}
              </Code>
            }
          />
        </ListItem>
        <ListItem className={classes.latestArtifactsListItem}>
          <ListItemText primary="Latest Artifacts" />
        </ListItem>
        {this.renderArtifactsTable()}
      </List>
    );
  }
}
