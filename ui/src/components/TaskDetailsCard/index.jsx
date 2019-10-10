import React, { Component, Fragment } from 'react';
import { arrayOf, shape, string } from 'prop-types';
import { CopyToClipboard } from 'react-copy-to-clipboard';
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
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import DateDistance from '../DateDistance';
import StatusLabel from '../StatusLabel';
import { task } from '../../utils/prop-types';
import urls from '../../utils/urls';
import Link from '../../utils/Link';

@withStyles(theme => ({
  headline: {
    paddingLeft: theme.spacing.triple,
    paddingRight: theme.spacing.triple,
  },
  cardContent: {
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: theme.spacing.double,
    paddingBottom: theme.spacing.double,
    '&:last-child': {
      paddingBottom: theme.spacing.double,
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
          <CardContent classes={{ root: classes.cardContent }}>
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
              <CopyToClipboard
                title={`${task.created} (Copy)`}
                text={task.created}>
                <ListItem button className={classes.listItemButton}>
                  <ListItemText
                    primary="Created"
                    secondary={<DateDistance from={task.created} />}
                  />
                  <ContentCopyIcon />
                </ListItem>
              </CopyToClipboard>
              <ListItem>
                <ListItemText
                  primary="Provisioner"
                  secondary={task.provisionerId}
                />
              </ListItem>
              <ListItem
                title="View Workers"
                button
                className={classes.listItemButton}
                component={Link}
                to={`/provisioners/${task.provisionerId}/worker-types/${task.workerType}`}>
                <ListItemText
                  primary="Worker Type"
                  secondary={task.workerType}
                />
                <LinkIcon />
              </ListItem>
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
                <ListItemText primary={showMore ? 'Less...' : 'More...'} />
                {showMore ? <ChevronUpIcon /> : <ChevronDownIcon />}
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
                <CopyToClipboard
                  title={`${task.deadline} (Copy)`}
                  text={task.deadline}>
                  <ListItem button className={classes.listItemButton}>
                    <ListItemText
                      primary="Deadline"
                      secondary={
                        <DateDistance
                          from={task.deadline}
                          offset={task.created}
                        />
                      }
                    />
                    <ContentCopyIcon />
                  </ListItem>
                </CopyToClipboard>
                <CopyToClipboard
                  title={`${task.expires} (Copy)`}
                  text={task.expires}>
                  <ListItem button className={classes.listItemButton}>
                    <ListItemText
                      primary="Expires"
                      secondary={<DateDistance from={task.expires} />}
                    />
                    <ContentCopyIcon />
                  </ListItem>
                </CopyToClipboard>
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
                    <List dense disablePadding>
                      {dependentTasks.map(task => (
                        <ListItem
                          button
                          component={Link}
                          className={classes.listItemButton}
                          to={`/tasks/${task.taskId}`}
                          key={task.taskId}
                          title="View Task">
                          <StatusLabel state={task.status.state} />
                          <ListItemText primary={task.metadata.name} />
                          <LinkIcon />
                        </ListItem>
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
