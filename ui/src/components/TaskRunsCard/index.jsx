import React, { Fragment, Component } from 'react';
import { withRouter } from 'react-router-dom';
import classNames from 'classnames';
import { func, number, string } from 'prop-types';
import Label from '@mozilla-frontend-infra/components/Label';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import Typography from '@material-ui/core/Typography';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Collapse from '@material-ui/core/Collapse';
import MobileStepper from '@material-ui/core/MobileStepper';
import Divider from '@material-ui/core/Divider';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import ChevronLeftIcon from 'mdi-react/ChevronLeftIcon';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ChevronRightIcon from 'mdi-react/ChevronRightIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import LockIcon from 'mdi-react/LockIcon';
import LockOpenOutlineIcon from 'mdi-react/LockOpenOutlineIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import Button from '../Button';
import ConnectionDataTable from '../ConnectionDataTable';
import CopyToClipboardListItem from '../CopyToClipboardListItem';
import DateDistance from '../DateDistance';
import StatusLabel from '../StatusLabel';
import NoRunsIcon from './NoRunsIcon';
import { ARTIFACTS_PAGE_SIZE } from '../../utils/constants';
import { runs } from '../../utils/prop-types';
import Link from '../../utils/Link';

const DOTS_VARIANT_LIMIT = 5;

@withRouter
@withStyles(
  theme => ({
    headline: {
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(2),
    },
    cardContent: {
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: theme.spacing(2),
      paddingBottom: theme.spacing(2),
    },
    collapsedCard: {
      paddingBottom: 0,
    },
    controls: {
      display: 'flex',
      alignItems: 'center',
      paddingLeft: theme.spacing(1),
      paddingBottom: theme.spacing(1),
    },
    listItemButton: {
      ...theme.mixins.listItemButton,
    },
    pointer: {
      cursor: 'pointer',
    },
    logButton: {
      marginRight: theme.spacing(1),
    },
    artifactsListItemContainer: {
      display: 'block',
    },
    boxVariantIcon: {
      width: '25%',
      height: 'auto',
    },
    boxVariant: {
      textAlign: 'center',
    },
    boxVariantText: {
      color: fade(theme.palette.text.primary, 0.4),
    },
    artifactLink: {
      textDecoration: 'none',
      display: 'flex',
      justifyContent: 'space-between',
      verticalAlign: 'middle',
    },
    artifactTableRow: {
      height: 'auto',
    },
    artifactNameWrapper: {
      display: 'inline-flex',
      flexBasis: '50%',
      flexGrow: 1,
    },
    artifactName: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    },
    liveLogLabel: {
      marginLeft: theme.spacing(0.5),
      marginBottom: theme.spacing(0.5),
    },
    previousPageArrow: {
      marginRight: 0,
      '& .mdi-icon': {
        fill: 'currentcolor',
      },
    },
    nextPageArrow: {
      marginRight: 0,
      '& .mdi-icon': {
        fill: 'currentcolor',
      },
    },
    lockIconDiv: {
      marginRight: theme.spacing(2),
    },
  }),
  { withTheme: true }
)
/**
 * Render a paginated card layout for the runs of a GraphQL task response.
 */
export default class TaskRunsCard extends Component {
  static propTypes = {
    /**
     * A collection of runs for a GraphQL task.
     */
    runs: runs.isRequired,
    /**
     * The worker type associated with the runs' task.
     */
    workerType: string.isRequired,
    /**
     * The provisioner ID associated with the runs' task.
     */
    provisionerId: string.isRequired,
    /**
     * The current selected run index to display in the card. Paging through
     * runs will trigger a history change, for which the `selectedRunId` can be
     * updated.
     */
    selectedRunId: number.isRequired,
    /**
     * Execute a function to load new artifacts when paging through them.
     */
    onArtifactsPageChange: func.isRequired,
  };

  state = {
    showMore: false,
  };

  getCurrentRun() {
    return this.props.runs[this.props.selectedRunId];
  }

  isLiveLog = () => {
    const { state } = this.getCurrentRun();

    return state === 'PENDING' || state === 'RUNNING';
  };

  getArtifactUrl = ({ url, isLog }) => {
    if (!url) {
      return '';
    }

    const { taskId, runId } = this.getCurrentRun();

    if (isLog) {
      const encoded = encodeURIComponent(url);

      return this.isLiveLog()
        ? `/tasks/${taskId}/runs/${runId}/logs/live/${encoded}`
        : `/tasks/${taskId}/runs/${runId}/logs/${encoded}`;
    }

    return url;
  };

  handleNext = () => {
    const { location, history } = this.props;
    const { taskId, runId } = this.getCurrentRun();

    history.push(`/tasks/${taskId}/runs/${runId + 1}${location.hash}`);
  };

  handlePrevious = () => {
    const { location, history } = this.props;
    const { taskId, runId } = this.getCurrentRun();

    history.push(`/tasks/${taskId}/runs/${runId - 1}${location.hash}`);
  };

  handleToggleArtifacts = () => {
    const { location, history } = this.props;
    const showArtifacts = location.hash === '#artifacts';

    showArtifacts
      ? history.replace(location.pathname)
      : history.replace(`${location.pathname}#artifacts`);
  };

  getLiveLogArtifactFromRun = run => {
    const artifact =
      run &&
      run.artifacts.edges.find(
        ({ node: { name } }) => name === 'public/logs/live.log'
      );

    if (!artifact) {
      return;
    }

    return artifact.node;
  };

  createSortedArtifactsConnection(artifacts) {
    return {
      ...artifacts,
      edges: [...artifacts.edges].sort((a, b) => {
        if (a.node.isPublic === b.node.isPublic) {
          return 0;
        }

        return a.node.isPublic ? -1 : 1;
      }),
    };
  }

  renderArtifactsTable() {
    const { classes, onArtifactsPageChange } = this.props;
    const run = this.getCurrentRun();
    const artifacts =
      run && this.createSortedArtifactsConnection(run.artifacts);

    return (
      <ConnectionDataTable
        connection={artifacts}
        pageSize={ARTIFACTS_PAGE_SIZE}
        columnsSize={3}
        onPageChange={onArtifactsPageChange}
        withoutTopPagination
        renderRow={({ node: artifact }) => (
          <TableRow
            key={`run-artifact-${run.taskId}-${run.runId}-${artifact.name}`}
            className={classNames(
              classes.listItemButton,
              classes.artifactTableRow,
              {
                [classes.pointer]: !!artifact.url,
              }
            )}
            hover={!!artifact.url}>
            <TableCell>
              <Link
                className={classes.artifactLink}
                to={this.getArtifactUrl(artifact)}>
                <div className={classes.lockIconDiv}>
                  {artifact.isPublic && <LockOpenOutlineIcon />}
                  {!artifact.isPublic && artifact.url && <LockIcon />}
                </div>
                <div className={classes.artifactNameWrapper}>
                  {artifact.isLog && (
                    <Label status="info" mini className={classes.logButton}>
                      LOG
                    </Label>
                  )}
                  <div className={classes.artifactName}>{artifact.name}</div>
                </div>
                <div>
                  {artifact.isPublic && <LinkIcon />}
                  {!artifact.isPublic && artifact.url && <OpenInNewIcon />}
                </div>
              </Link>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }

  handleToggleMore = () => {
    this.setState({ showMore: !this.state.showMore });
  };

  render() {
    const {
      classes,
      runs,
      selectedRunId,
      provisionerId,
      workerType,
      theme,
    } = this.props;
    const { showMore } = this.state;
    const run = this.getCurrentRun();
    const liveLogArtifact = this.getLiveLogArtifactFromRun(run);
    const showArtifacts = window.location.hash === '#artifacts';

    return (
      <Card raised>
        <div>
          <CardContent
            classes={{
              root: classNames(classes.cardContent, {
                [classes.collapsedCard]: !showMore && run,
              }),
            }}>
            <Typography variant="h5" className={classes.headline}>
              {run ? `Task Run ${selectedRunId}` : 'Task Run'}
            </Typography>
            {run ? (
              <Fragment>
                <List>
                  <ListItem>
                    <ListItemText
                      primary="State"
                      secondary={<StatusLabel state={run.state} />}
                    />
                  </ListItem>
                  {liveLogArtifact && (
                    <Link to={this.getArtifactUrl(liveLogArtifact)}>
                      <ListItem button className={classes.listItemButton}>
                        <ListItemText
                          primary={
                            <Fragment>
                              View Live Log{' '}
                              <Label
                                status="info"
                                mini
                                className={classes.liveLogLabel}>
                                LOG
                              </Label>
                            </Fragment>
                          }
                          secondary={liveLogArtifact.name}
                        />
                        <LinkIcon />
                      </ListItem>
                    </Link>
                  )}
                  <ListItem
                    button
                    className={classes.listItemButton}
                    onClick={this.handleToggleArtifacts}>
                    <ListItemText primary="Artifacts" />
                    {showArtifacts ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  </ListItem>
                  <Collapse in={showArtifacts} timeout="auto">
                    <List component="div" disablePadding>
                      <ListItem
                        className={classes.artifactsListItemContainer}
                        component="div"
                        disableGutters>
                        {this.renderArtifactsTable()}
                        <Divider />
                      </ListItem>
                    </List>
                  </Collapse>
                  <ListItem>
                    <ListItemText
                      primary="Reason Resolved"
                      secondary={
                        run.reasonResolved ? (
                          <StatusLabel
                            variant="default"
                            state={run.reasonResolved}
                          />
                        ) : (
                          <em>n/a</em>
                        )
                      }
                    />
                  </ListItem>
                  <CopyToClipboardListItem
                    tooltipTitle={run.scheduled}
                    textToCopy={run.scheduled}
                    primary="Scheduled"
                    secondary={<DateDistance from={run.scheduled} />}
                  />
                  <CopyToClipboardListItem
                    tooltipTitle={run.started}
                    textToCopy={run.started}
                    primary="Started"
                    secondary={
                      run.started ? (
                        <DateDistance
                          from={run.started}
                          offset={run.scheduled}
                        />
                      ) : (
                        <em>n/a</em>
                      )
                    }
                  />
                  <CopyToClipboardListItem
                    tooltipTitle={run.resolved}
                    textToCopy={run.resolved}
                    primary="Resolved"
                    secondary={
                      run.resolved ? (
                        <DateDistance
                          from={run.resolved}
                          offset={run.started}
                        />
                      ) : (
                        <em>n/a</em>
                      )
                    }
                  />
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
                  <List component="div" disablePadding>
                    <ListItem>
                      <ListItemText
                        primary="Reason Created"
                        secondary={
                          <StatusLabel
                            variant="default"
                            state={run.reasonCreated}
                          />
                        }
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Worker Group"
                        secondary={run.workerGroup || <em>n/a</em>}
                      />
                    </ListItem>
                    <Link
                      to={`/provisioners/${provisionerId}/worker-types/${workerType}/workers/${run.workerGroup}/${run.workerId}`}>
                      <ListItem
                        title="View Worker"
                        button
                        className={classes.listItemButton}>
                        <ListItemText
                          primary="Worker ID"
                          secondary={run.workerId}
                        />
                        <LinkIcon />
                      </ListItem>
                    </Link>
                    <CopyToClipboardListItem
                      tooltipTitle={run.takenUntil}
                      textToCopy={run.takenUntil}
                      primary="Taken Until"
                      secondary={
                        run.takenUntil ? (
                          <DateDistance from={run.takenUntil} />
                        ) : (
                          <em>n/a</em>
                        )
                      }
                    />
                  </List>
                </Collapse>
              </Fragment>
            ) : (
              <div className={classes.boxVariant}>
                <NoRunsIcon
                  fill={theme.palette.text.primary}
                  className={classes.boxVariantIcon}
                />
                <Typography className={classes.boxVariantText} variant="h6">
                  No Runs
                </Typography>
                <Typography variant="body2" className={classes.boxVariantText}>
                  A run will be created when the task gets schedueled.
                </Typography>
              </div>
            )}
          </CardContent>
          <MobileStepper
            variant={runs.length > DOTS_VARIANT_LIMIT ? 'progress' : 'dots'}
            position="static"
            steps={runs.length}
            activeStep={selectedRunId}
            nextButton={
              <Button
                className={classes.nextPageArrow}
                size="small"
                onClick={this.handleNext}
                disabled={run ? selectedRunId === runs.length - 1 : true}>
                Next
                <ChevronRightIcon />
              </Button>
            }
            backButton={
              <Button
                className={classes.previousPageArrow}
                size="small"
                onClick={this.handlePrevious}
                disabled={run ? selectedRunId === 0 : true}>
                <ChevronLeftIcon />
                Previous
              </Button>
            }
          />
        </div>
      </Card>
    );
  }
}
