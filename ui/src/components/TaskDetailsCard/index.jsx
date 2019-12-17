import React, { Component, Fragment } from 'react';
import classNames from 'classnames';
import { arrayOf, shape, string } from 'prop-types';
import deepSortObject from 'deep-sort-object';
import Code from '@mozilla-frontend-infra/components/Code';
import Label from '@mozilla-frontend-infra/components/Label';
import { withStyles } from '@material-ui/core/styles';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import CopyToClipboardListItem from '../CopyToClipboardListItem';
import DateDistance from '../DateDistance';
import StatusLabel from '../StatusLabel';
import { task } from '../../utils/prop-types';
import urls from '../../utils/urls';
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
  collapsedCard: {
    '&:last-child': {
      paddingBottom: theme.spacing(0),
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
}))
/**
 * Render information in a card layout about a task.
 */
export default class TaskDetailsCard extends Component {
  static defaultProps = {
    dependentTasks: null,
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
        taskId: string,
        status: shape({
          state: string,
        }),
        metadata: shape({
          name: string,
        }),
      })
    ),
  };

  state = {
    showPayload: false,
    showMore: false,
  };

  handleTogglePayload = () => {
    this.setState({ showPayload: !this.state.showPayload });
  };

  handleToggleMore = () => {
    this.setState({ showMore: !this.state.showMore });
  };

  render() {
    const { classes, task, dependentTasks } = this.props;
    const { showPayload, showMore } = this.state;
    const isExternal = task.metadata.source.startsWith('https://');
    const payload = deepSortObject(task.payload);

    return (
      <Card raised>
        <div>
          <CardContent
            classes={{
              root: classNames(classes.cardContent, {
                [classes.collapsedCard]: !showMore,
              }),
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
              <ListItem>
                <ListItemText
                  primary="Provisioner"
                  secondary={task.provisionerId}
                />
              </ListItem>
              <Link
                to={`/provisioners/${task.provisionerId}/worker-types/${task.workerType}`}>
                <ListItem
                  title="View Workers"
                  button
                  className={classes.listItemButton}>
                  <ListItemText
                    primary="Worker Type"
                    secondary={task.workerType}
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
                        <Code language="json">
                          {JSON.stringify(payload, null, 2)}
                        </Code>
                      }
                    />
                  </ListItem>
                </List>
              </Collapse>
              <ListItem
                button
                className={classes.listItemButton}
                component="a"
                href={urls.api('queue', 'v1', `task/${task.taskId}`)}
                target="_blank"
                rel="noopener noreferrer">
                <ListItemText primary="View task definition" />
                <OpenInNewIcon />
              </ListItem>
              <ListItem
                button
                className={classes.listItemButton}
                onClick={this.handleToggleMore}>
                <ListItemText
                  disableTypography
                  primary={
                    <Typography
                      variant="subtitle1"
                      align="center"
                      color="textSecondary">
                      {showMore ? 'See Less' : 'See More'}
                    </Typography>
                  }
                />
              </ListItem>
            </List>
            <Collapse in={showMore} timeout="auto">
              <List>
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
                        <Link key={task.taskId} to={`/tasks/${task.taskId}`}>
                          <ListItem
                            button
                            className={classes.listItemButton}
                            title="View Task">
                            <StatusLabel state={task.status.state} />
                            <ListItemText
                              className={classes.listItemText}
                              primary={task.metadata.name}
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
                <ListItem>
                  <ListItemText
                    primary="Scheduler ID"
                    secondary={
                      task.schedulerId === '-' ? <em>n/a</em> : task.schedulerId
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    disableTypography
                    primary={
                      <Typography variant="subtitle1">Scopes</Typography>
                    }
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
                    primary={
                      <Typography variant="subtitle1">Routes</Typography>
                    }
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
                      primary={
                        <Typography variant="subtitle1">Extra</Typography>
                      }
                      secondary={
                        <Code language="json">
                          {JSON.stringify(task.extra, null, 2)}
                        </Code>
                      }
                    />
                  </ListItem>
                )}
              </List>
            </Collapse>
          </CardContent>
        </div>
      </Card>
    );
  }
}
