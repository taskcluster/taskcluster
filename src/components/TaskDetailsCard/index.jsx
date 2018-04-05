import { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  arrayOf,
  instanceOf,
  number,
  object,
  oneOf,
  oneOfType,
  shape,
  string,
} from 'prop-types';
import { withStyles } from 'material-ui/styles';
import Card, { CardContent } from 'material-ui/Card';
import Collapse from 'material-ui/transitions/Collapse';
import List, { ListItem, ListItemText } from 'material-ui/List';
import Typography from 'material-ui/Typography';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import DateDistance from '../DateDistance';
import Code from '../Code';
import Label from '../Label';
import StatusLabel from '../StatusLabel';

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
    '& svg': {
      transition: theme.transitions.create('fill'),
      fill: theme.palette.primary.light,
    },
    '&:hover svg': {
      fill: theme.palette.common.white,
    },
  },
  pre: {
    margin: 0,
    fontSize: theme.typography.body2.fontSize,
  },
}))
export default class TaskDetailsCard extends Component {
  static propTypes = {
    task: shape({
      metadata: shape({
        name: string,
        description: string,
        owner: string,
        source: string,
      }),
      status: shape({
        state: oneOf([
          'RUNNING',
          'PENDING',
          'UNSCHEDULED',
          'COMPLETED',
          'FAILED',
          'EXCEPTION',
        ]),
        retriesLeft: number,
      }),
      retries: number,
      created: oneOfType([string, instanceOf(Date)]),
      deadline: oneOfType([string, instanceOf(Date)]),
      expires: oneOfType([string, instanceOf(Date)]),
      priority: string,
      provisionerId: string,
      workerType: string,
      schedulerId: string,
      dependencies: arrayOf(string),
      tags: object, // eslint-disable-line
      scopes: arrayOf(string),
      routes: arrayOf(string),
      payload: object, // eslint-disable-line
      extra: object, // eslint-disable-line
    }).isRequired,
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
    const { classes, task } = this.props;
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
                href={`${process.env.BASE_URL}/queue/v1/task/${task.taskId}`}
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
              {task.dependentTasks.length ? (
                <Fragment>
                  <ListItem>
                    <ListItemText primary="Dependencies" />
                  </ListItem>
                  <List dense disablePadding>
                    {task.dependentTasks.map(task => (
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
