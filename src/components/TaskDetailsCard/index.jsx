import { Component, Fragment } from 'react';
import { arrayOf, shape, string } from 'prop-types';
import { Link } from 'react-router-dom';
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
import Code from '../Code';
import Label from '../Label';
import StatusLabel from '../StatusLabel';
import { task } from '../../utils/prop-types';

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
      paddingBottom: theme.spacing.triple,
    },
  },
  sourceHeadline: {
    textOverflow: 'ellipsis',
    overflowX: 'hidden',
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
  pre: {
    margin: 0,
    fontSize: theme.typography.body2.fontSize,
  },
}))
/**
 * Render information in a card layout about a task.
 */
export default class TaskDetailsCard extends Component {
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
    showExtra: false,
  };

  handleTogglePayload = () => {
    this.setState({ showPayload: !this.state.showPayload });
  };

  handleToggleExtra = () => {
    this.setState({ showExtra: !this.state.showExtra });
  };

  render() {
    const { classes, task, dependentTasks } = this.props;
    const { showPayload, showExtra } = this.state;
    const isExternal = task.metadata.source.startsWith('https://');
    const tags = Object.entries(task.tags);

    return (
      <Card raised>
        <div>
          <CardContent classes={{ root: classes.cardContent }}>
            <Typography variant="headline" className={classes.headline}>
              Task Details
            </Typography>

            <List>
              <ListItem
                button
                className={classes.listItemButton}
                component={isExternal ? 'a' : Link}
                to={isExternal ? null : task.metadata.source}
                href={isExternal ? task.metadata.source : null}
                target={isExternal ? '_blank' : null}
                rel={isExternal ? 'noopener noreferrer' : null}>
                <ListItemText
                  classes={{ secondary: classes.sourceHeadline }}
                  primary="Source"
                  secondary={task.metadata.source}
                />
                {isExternal ? <OpenInNewIcon /> : <LinkIcon />}
              </ListItem>
              <ListItem
                button
                className={classes.listItemButton}
                component="a"
                href={`queue.${
                  process.env.TASKCLUSTER_ROOT_URL
                }/queue/v1/task/${task.taskId}`}
                target="_blank"
                rel="noopener noreferrer">
                <ListItemText primary="View task definition" />
                <OpenInNewIcon />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="State"
                  secondary={<StatusLabel state={task.status.state} />}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Retries Left"
                  secondary={`${task.status.retriesLeft} of ${task.retries}`}
                />
              </ListItem>
              <ListItem button className={classes.listItemButton}>
                <ListItemText
                  primary="Created"
                  secondary={<DateDistance from={task.created} />}
                />
                <ContentCopyIcon />
              </ListItem>
              <ListItem button className={classes.listItemButton}>
                <ListItemText
                  primary="Deadline"
                  secondary={
                    <DateDistance from={task.deadline} offset={task.created} />
                  }
                />
                <ContentCopyIcon />
              </ListItem>
              <ListItem button className={classes.listItemButton}>
                <ListItemText
                  primary="Expires"
                  secondary={<DateDistance from={task.expires} />}
                />
                <ContentCopyIcon />
              </ListItem>
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
              <ListItem>
                <ListItemText
                  primary="Provisioner"
                  secondary={task.provisionerId}
                />
              </ListItem>
              <ListItem
                button
                className={classes.listItemButton}
                component={Link}
                to={`/provisioners/${task.provisionerId}/worker-types/${
                  task.workerType
                }`}>
                <ListItemText
                  primary="Worker Type"
                  secondary={task.workerType}
                />
                <LinkIcon />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Scheduler ID"
                  secondary={
                    task.schedulerId === '-' ? <em>n/a</em> : task.schedulerId
                  }
                />
              </ListItem>
              {dependentTasks && dependentTasks.length ? (
                <Fragment>
                  <ListItem>
                    <ListItemText primary="Dependencies" />
                  </ListItem>
                  <List dense disablePadding>
                    {dependentTasks.map(task => (
                      <ListItem
                        button
                        className={classes.listItemButton}
                        component={Link}
                        to={`/tasks/${task.taskId}`}
                        key={task.taskId}>
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

              {tags.length ? (
                <ListItem>
                  <ListItemText primary="Tags" secondary={<em>n/a</em>} />
                </ListItem>
              ) : (
                <Fragment>
                  <ListItem>
                    <ListItemText primary="Tags" />
                  </ListItem>
                  <List dense disablePadding>
                    {tags.map(([key, value]) => (
                      <ListItem key={key}>
                        <ListItemText
                          primary={key}
                          secondary={<em>{value}</em>}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Fragment>
              )}

              <ListItem>
                <ListItemText
                  primary="Requires"
                  secondary={
                    <Fragment>
                      This task will be scheduled when
                      <strong>
                        <em> dependencies </em>
                      </strong>
                      are
                      {task.requires === 'ALL_COMPLETED' ? (
                        <Fragment>
                          &nbsp;<code>all-completed</code> successfully.
                        </Fragment>
                      ) : (
                        <Fragment>
                          &nbsp;<code>all-resolved</code> with any resolution.
                        </Fragment>
                      )}
                    </Fragment>
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  disableTypography
                  primary={<Typography variant="subheading">Scopes</Typography>}
                  secondary={
                    task.scopes.length ? (
                      <pre className={classes.pre}>
                        {task.scopes.join('\n')}
                      </pre>
                    ) : (
                      <em>n/a</em>
                    )
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  disableTypography
                  primary={<Typography variant="subheading">Routes</Typography>}
                  secondary={
                    task.routes.length ? (
                      <pre className={classes.pre}>
                        {task.routes.join('\n')}
                      </pre>
                    ) : (
                      <em>n/a</em>
                    )
                  }
                />
              </ListItem>

              <ListItem
                button
                className={classes.listItemButton}
                onClick={this.handleTogglePayload}>
                <ListItemText primary="Payload" />
                {showPayload ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </ListItem>
              <Collapse in={showPayload} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  <ListItem>
                    <ListItemText
                      disableTypography
                      primary={
                        <Code language="json">
                          {JSON.stringify(task.payload, null, 2)}
                        </Code>
                      }
                    />
                  </ListItem>
                </List>
              </Collapse>

              {Object.keys(task.extra).length !== 0 && (
                <Fragment>
                  <ListItem
                    button
                    className={classes.listItemButton}
                    onClick={this.handleToggleExtra}>
                    <ListItemText primary="Extra" />
                    {showExtra ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  </ListItem>
                  <Collapse in={showExtra} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                      <ListItem>
                        <ListItemText
                          disableTypography
                          primary={
                            <Code language="json">
                              {JSON.stringify(task.extra, null, 2)}
                            </Code>
                          }
                        />
                      </ListItem>
                    </List>
                  </Collapse>
                </Fragment>
              )}
            </List>
          </CardContent>
        </div>
      </Card>
    );
  }
}
