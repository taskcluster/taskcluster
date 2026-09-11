import React, { Component } from 'react';
import { arrayOf, bool, string } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import JsonDisplay from '../JsonDisplay';
import PaginatedDataTable from '../PaginatedDataTable';
import DateDistance from '../DateDistance';
import {
  artifact,
  indexedTask,
  date,
  pagination,
} from '../../utils/prop-types';
import { ARTIFACTS_PAGE_SIZE } from '../../utils/constants';
import Link from '../../utils/Link';
import { findArtifactFromTaskUrl } from '../../utils/getArtifactUrl';
import getIconFromMime from '../../utils/getIconFromMime';
import formatBytes from '../../utils/formatBytes';
import { withAuth } from '../../utils/Auth';

const buildArtifactUrl = ({ user, namespace, name, contentType }) => {
  const icon = getIconFromMime(contentType);

  return {
    icon,
    name,
    url: findArtifactFromTaskUrl({ user, namespace, name }),
    // refresh the URL (with a fresh expiration time) on a click, and open it
    // in a new window
    handleArtifactClick(ev) {
      const url = findArtifactFromTaskUrl({ user, namespace, name });

      if (ev.altKey || ev.metaKey || ev.ctrlKey || ev.shiftKey) {
        return;
      }

      window.open(url, '_blank', 'noopener,noreferrer');
      ev.preventDefault();
    },
  };
};

@withAuth
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
  sizeCell: {
    whiteSpace: 'nowrap',
    color: theme.palette.text.secondary,
    marginRight: theme.spacing(1),
    alignSelf: 'center',
  },
}))
export default class IndexedEntry extends Component {
  static propTypes = {
    indexedTask: indexedTask.isRequired,
    created: date.isRequired,
    /** A page of latest artifacts for the indexed task. */
    latestArtifacts: arrayOf(artifact).isRequired,
    /** Whether the artifacts page is still being fetched. */
    artifactsLoading: bool,
    ...pagination,
    taskGroupId: string,
  };

  static defaultProps = {
    artifactsLoading: false,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  loadArtifacts = artifacts => {
    const {
      indexedTask: { taskId, namespace },
      user,
    } = this.props;

    if (!taskId || !artifacts.length) {
      return artifacts;
    }

    return artifacts.map(artifact => ({
      ...artifact,
      // Build the URLs here so that they'll be updated when people login
      ...buildArtifactUrl({
        user,
        name: artifact.name,
        contentType: artifact.contentType,
        namespace,
      }),
    }));
  };

  renderArtifactsTable() {
    const {
      classes,
      latestArtifacts,
      artifactsLoading,
      page,
      hasNextPage,
      hasPreviousPage,
      onNextPage,
      onPreviousPage,
    } = this.props;
    const artifacts = this.loadArtifacts(latestArtifacts);

    return (
      <PaginatedDataTable
        items={artifacts}
        pageSize={ARTIFACTS_PAGE_SIZE}
        columnsSize={3}
        page={page}
        loading={artifactsLoading}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        noItemsMessage="No artifacts for this task."
        renderRow={artifact => (
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
                to={artifact.url}
                onClick={artifact.handleArtifactClick}>
                <div className={classes.artifactIconWithName}>
                  <div className={classes.artifactIcons}>
                    {artifact.icon && <artifact.icon />}
                  </div>
                  {artifact.name}
                </div>
                <div className={classes.sizeCell}>
                  {formatBytes(artifact.contentLength)}
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
    const { classes, created, indexedTask, taskGroupId } = this.props;

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
            <ListItemText primary="View task" secondary={indexedTask.taskId} />
            <LinkIcon />
          </ListItem>
        </Link>
        {taskGroupId && (
          <Link to={`/tasks/groups/${taskGroupId}`}>
            <ListItem button className={classes.listItemButton}>
              <ListItemText primary="View task group" secondary={taskGroupId} />
              <LinkIcon />
            </ListItem>
          </Link>
        )}
        <ListItem component="div">
          <ListItemText
            primary="Data"
            secondaryTypographyProps={{
              component: 'div',
            }}
            secondary={
              <JsonDisplay syntax="yaml" objectContent={indexedTask.data} />
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
