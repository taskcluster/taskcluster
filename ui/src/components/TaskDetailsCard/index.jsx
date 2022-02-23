import React, { Component, Fragment } from 'react';
import classNames from 'classnames';
import { arrayOf, func, shape, string } from 'prop-types';
import deepSortObject from 'deep-sort-object';
import { withStyles } from '@material-ui/core/styles';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import Label from '../Label';
import JsonDisplay from '../JsonDisplay';
import ConnectionDataTable from '../ConnectionDataTable';
import CopyToClipboardListItem from '../CopyToClipboardListItem';
import DateDistance from '../DateDistance';
import StatusLabel from '../StatusLabel';
import { DEPENDENTS_PAGE_SIZE } from '../../utils/constants';
import { pageInfo, task } from '../../utils/prop-types';
import splitTaskQueueId from '../../utils/splitTaskQueueId';
import Link from '../../utils/Link';

@withStyles(theme => ({
  headline: {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
  },
  cardContent: {
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: theme.spacing(2),
    '&:last-child': {
      paddingBottom: theme.spacing(2),
    },
  },
  sourceHeadline: {
    textOverflow: 'ellipsis',
    overflowX: 'hidden',
    whiteSpace: 'nowrap',
  },
  sourceHeadlineText: {
    flex: 1,
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
  pre: {
    margin: 0,
    fontSize: theme.typography.body2.fontSize,
  },
  unorderedList: {
    ...theme.mixins.unorderedList,
  },
  listItemText: {
    paddingLeft: theme.spacing(2),
  },
  payload: {
    whiteSpace: 'break-spaces',
  },
  dependentsStatusAndNameContainer: {
    display: 'flex',
  },
  dependentsStatus: {
    marginRight: theme.spacing(2),
  },
  dependentsName: {
    display: 'inline-flex',
    flexBasis: '50%',
    flexGrow: 1,
  },
  dependentsTableRow: {
    cursor: 'pointer',
  },
  dependentsLink: {
    textDecoration: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    verticalAlign: 'middle',
  },
}))
/**
 * Render information in a card layout about a task.
 */
export default class TaskDetailsCard extends Component {
  static defaultProps = {
    dependentTasks: null,
    dependents: null,
  };

  static propTypes = {
    /**
     * A GraphQL task response.
     */
    task: task.isRequired,
    /**
     * A collection of GraphQL task responses associated with the given task.
     */
    dependentTasks: arrayOf(
      shape({
        taskId: string.isRequired,
        // note that status and metadata may be missing
        status: shape({
          state: string,
        }),
        metadata: shape({
          name: string,
        }),
      })
    ),
    dependents: shape({
      edges: arrayOf(task),
      pageInfo,
    }),
    onDependentsPageChange: func.isRequired,
  };

  state = {
    showPayload: false,
  };

  handleTogglePayload = () => {
    this.setState({ showPayload: !this.state.showPayload });
  };

  render() {
    const {
      classes,
      task,
      dependentTasks,
      dependents,
      onDependentsPageChange,
    } = this.props;
    const { showPayload } = this.state;
    const isExternal = task.metadata.source.startsWith('https://');
    const payload = deepSortObject(task.payload);
    const { provisionerId, workerType } = splitTaskQueueId(task.taskQueueId);

    return (
      <Card raised>
        <div>
          <CardContent
            classes={{
              root: classNames(classes.cardContent),
            }}>
            <Typography variant="h5" className={classes.headline}>
              Task Details
            </Typography>
            <List>
              <ListItem>
                <ListItemText
                  primary="State"
                  secondary={<StatusLabel state={task.status.state} />}
                />
              </ListItem>
              <CopyToClipboardListItem
                tooltipTitle={task.created}
                textToCopy={task.created}
                primary="Created"
                secondary={<DateDistance from={task.created} />}
              />
              <Link
                to={`/provisioners/${provisionerId}/worker-types/${workerType}`}>
                <ListItem
                  title="View Workers"
                  button
                  className={classes.listItemButton}>
                  <ListItemText
                    primary="Task Queue ID"
                    secondary={task.taskQueueId}
                  />
                  <LinkIcon />
                </ListItem>
              </Link>
              <ListItem
                button
                className={classes.listItemButton}
                onClick={this.handleTogglePayload}>
                <ListItemText primary="Payload" />
                {showPayload ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </ListItem>
              <Collapse in={showPayload} timeout="auto">
                <List component="div" disablePadding>
                  <ListItem>
                    <ListItemText
                      disableTypography
                      primary={
                        <JsonDisplay
                          wrapperClassName={classes.payload}
                          syntax="json"
                          objectContent={payload}
                        />
                      }
                    />
                  </ListItem>
                </List>
              </Collapse>
              <Link
                className={classes.listItemButton}
                to={`/tasks/${task.taskId}/definition`}>
                <ListItem button className={classes.listItemButton}>
                  <ListItemText primary="Full Task Definition" />
                </ListItem>
              </Link>

              <ListItem
                button
                className={classes.listItemButton}
                component="a"
                href={task.metadata.source}
                target="_blank"
                rel="noopener noreferrer">
                <ListItemText
                  className={classes.sourceHeadlineText}
                  classes={{ secondary: classes.sourceHeadline }}
                  primary="Source"
                  secondary={task.metadata.source}
                  title={task.metadata.source}
                />
                {isExternal ? <OpenInNewIcon /> : <LinkIcon />}
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Retries Left"
                  secondary={`${task.status.retriesLeft} of ${task.retries}`}
                />
              </ListItem>
              <CopyToClipboardListItem
                tooltipTitle={task.deadline}
                textToCopy={task.deadline}
                primary="Deadline"
                secondary={
                  <DateDistance from={task.deadline} offset={task.created} />
                }
              />
              <CopyToClipboardListItem
                tooltipTitle={task.expires}
                textToCopy={task.expires}
                primary="Expires"
                secondary={<DateDistance from={task.expires} />}
              />
              <ListItem>
                <ListItemText
                  primary="Priority"
                  secondary={
                    <Label mini status="info">
                      {task.priority}
                    </Label>
                  }
                />
              </ListItem>
              {dependentTasks && dependentTasks.length ? (
                <Fragment>
                  <ListItem>
                    <ListItemText
                      primary="Dependencies"
                      secondary={
                        <Fragment>
                          This task will be scheduled when
                          <strong>
                            <em> dependencies </em>
                          </strong>
                          are
                          {task.requires === 'ALL_COMPLETED' ? (
                            <Fragment>
                              &nbsp;
                              <code>all-completed</code> successfully.
                            </Fragment>
                          ) : (
                            <Fragment>
                              &nbsp;
                              <code>all-resolved</code> with any resolution.
                            </Fragment>
                          )}
                        </Fragment>
                      }
                    />
                  </ListItem>
                  <List disablePadding>
                    {dependentTasks.map(task => (
                      // note that the task might not exist, if it has
                      // expired
                      <Link key={task.taskId} to={`/tasks/${task.taskId}`}>
                        <ListItem
                          button
                          className={classes.listItemButton}
                          title="View Task">
                          <StatusLabel
                            state={task.status?.state || 'EXPIRED'}
                          />
                          <ListItemText
                            primaryTypographyProps={{ variant: 'body2' }}
                            className={classes.listItemText}
                            primary={task.metadata?.name || task.taskId}
                          />
                          <LinkIcon />
                        </ListItem>
                      </Link>
                    ))}
                  </List>
                </Fragment>
              ) : (
                <ListItem>
                  <ListItemText
                    primary="Dependencies"
                    secondary={<em>n/a</em>}
                  />
                </ListItem>
              )}
              {dependents && dependents.edges && dependents.edges.length ? (
                <Fragment>
                  <ListItem>
                    <ListItemText
                      primary="Dependents"
                      secondary="This task blocks the following tasks from being scheduled."
                    />
                  </ListItem>
                  <ConnectionDataTable
                    withoutTopPagination
                    connection={dependents}
                    pageSize={DEPENDENTS_PAGE_SIZE}
                    sortByHeader={null}
                    sortDirection="desc"
                    onPageChange={onDependentsPageChange}
                    allowFilter
                    filterFunc={({ node: metadata }, filterValue) =>
                      String(metadata.name).includes(filterValue)
                    }
                    renderRow={({
                      node: {
                        taskId,
                        metadata: { name },
                        status: { state },
                      },
                    }) => (
                      <TableRow
                        hover
                        className={classNames(
                          classes.listItemButton,
                          classes.dependentsTableRow
                        )}
                        key={taskId}>
                        <TableCell title="View Task">
                          <Link
                            className={classes.dependentsLink}
                            to={`/tasks/${encodeURIComponent(taskId)}`}>
                            <div
                              className={
                                classes.dependentsStatusAndNameContainer
                              }>
                              <div>
                                <StatusLabel
                                  className={classes.dependentsStatus}
                                  state={state}
                                />
                              </div>
                              <div className={classes.dependentsName}>
                                <Typography variant="body2" noWrap>
                                  {name}
                                </Typography>
                              </div>
                            </div>
                            <div>
                              <LinkIcon
                                className={classes.dependentsLinkIcon}
                              />
                            </div>
                          </Link>
                        </TableCell>
                      </TableRow>
                    )}
                  />
                </Fragment>
              ) : (
                <ListItem>
                  <ListItemText primary="Dependents" secondary={<em>n/a</em>} />
                </ListItem>
              )}
              <ListItem>
                <ListItemText primary="Project ID" secondary={task.projectId} />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Scheduler ID"
                  secondary={task.schedulerId}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  disableTypography
                  primary={<Typography variant="subtitle1">Scopes</Typography>}
                  secondary={
                    task.scopes.length ? (
                      <ul className={classes.unorderedList}>
                        {task.scopes.map(scope => (
                          <li key={scope}>
                            <Typography
                              variant="body2"
                              component="span"
                              color="textSecondary">
                              {scope}
                            </Typography>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <em>n/a</em>
                    )
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  disableTypography
                  primary={<Typography variant="subtitle1">Routes</Typography>}
                  secondary={
                    task.routes.length ? (
                      <ul className={classes.unorderedList}>
                        {task.routes.map(route => (
                          <li key={route}>
                            <Typography
                              variant="body2"
                              component="span"
                              color="textSecondary">
                              {route}
                            </Typography>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <em>n/a</em>
                    )
                  }
                />
              </ListItem>
              {Object.keys(task.extra).length !== 0 && (
                <ListItem>
                  <ListItemText
                    disableTypography
                    primary={<Typography variant="subtitle1">Extra</Typography>}
                    secondary={
                      <JsonDisplay syntax="json" objectContent={task.extra} />
                    }
                  />
                </ListItem>
              )}
            </List>
          </CardContent>
        </div>
      </Card>
    );
  }
}
