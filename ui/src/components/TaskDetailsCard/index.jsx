import React, { Component, Fragment } from 'react';
import classNames from 'classnames';
import { arrayOf, func, shape, object } from 'prop-types';
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
import { LinearProgress } from '@material-ui/core';
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
import { getTaskDefinitions, getTaskStatuses } from '../../utils/queueTask';

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
  dependenciesList: {
    maxHeight: 400,
    overflowY: 'auto',
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
    dependents: shape({
      edges: arrayOf(task),
      pageInfo,
    }),
    onDependentsPageChange: func.isRequired,
    user: object,
  };

  state = {
    showPayload: false,
    dependentTasks: null,
    loading: false,
  };

  handleTogglePayload = () => {
    this.setState({ showPayload: !this.state.showPayload });
  };

  componentDidMount() {
    this.fetchDependentTasks();
  }

  async fetchDependentTasks() {
    const { task, user } = this.props;

    this.setState({ loading: true });

    if (task?.dependencies?.length > 0) {
      const definitions = await getTaskDefinitions({
        taskIds: task.dependencies,
        user,
      });
      const statuses = await getTaskStatuses({
        taskIds: task.dependencies,
        user,
      });
      // merge back everything into { taskId, status, metadata }
      const dependentTasks = task.dependencies.map(taskId => {
        const definition = definitions.find(d => d.taskId === taskId);
        const status = statuses.find(s => s.taskId === taskId);

        return {
          taskId,
          status: status ? status.status : null,
          metadata: definition ? definition?.task?.metadata : null,
        };
      });

      this.setState({ dependentTasks });
    }

    this.setState({ loading: false });
  }

  render() {
    const { classes, task, dependents, onDependentsPageChange } = this.props;
    const { showPayload, dependentTasks, loading } = this.state;
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
                tooltipTitle={task.taskId}
                textToCopy={task.taskId}
                primary="Task ID"
                secondary={task.taskId}
              />
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
                          syntax="yaml"
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
              {task.dependencies.length ? (
                <Fragment>
                  <ListItem>
                    <ListItemText
                      primary={`Dependencies (${task.dependencies.length})`}
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
                  {loading && <LinearProgress />}
                  {!loading && dependentTasks && (
                    <List disablePadding className={classes.dependenciesList}>
                      {dependentTasks.map(dep => (
                        // note that the task might not exist, if it has
                        // expired
                        <Link key={dep.taskId} to={`/tasks/${dep.taskId}`}>
                          <ListItem
                            button
                            className={classes.listItemButton}
                            title="View Task">
                            <StatusLabel
                              state={dep.status?.state || 'EXPIRED'}
                            />
                            <ListItemText
                              primaryTypographyProps={{ variant: 'body2' }}
                              className={classes.listItemText}
                              primary={dep.metadata?.name || dep.taskId}
                            />
                            <LinkIcon />
                          </ListItem>
                        </Link>
                      ))}
                    </List>
                  )}
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
                      secondary="The following tasks depend on this task resolving successfully."
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
                    filterFunc={({ node }, filterValue) =>
                      String(node?.metadata?.name)
                        .toLowerCase()
                        .includes(filterValue.toLowerCase())
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
                      <JsonDisplay syntax="yaml" objectContent={task.extra} />
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
