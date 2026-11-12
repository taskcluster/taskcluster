import React, { Component } from 'react';
import classNames from 'classnames';
import withStyles from '../../../utils/withStyles';
import { bool, func } from 'prop-types';
import { withRouter } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Anchor from '../components/Anchor';
import contributorsJson from '../../../../../.all-contributorsrc';

@withRouter
@withStyles(theme => ({
  cardActionArea: {
    height: '100%',
    textAlign: 'center',
  },
  avatar: {
    height: 80,
    width: 80,
    margin: `0 auto ${theme.spacing(1)} auto`,
    boxShadow: '0px 0px 4px rgba(2,2,2,0.2)',
  },
  gutterTop: {
    marginTop: theme.spacing(0.5),
  },
  gutterBottom: {
    marginBottom: theme.spacing(1.5),
  },
}))
export default class People extends Component {
  static propTypes = {
    filter: func,
    gutterTop: bool,
    gutterBottom: bool,
  };

  render() {
    const { classes, filter, gutterTop, gutterBottom } = this.props;
    const { contributors } = contributorsJson;

    return (
      <Grid
        container
        spacing={1}
        className={classNames({
          [classes.gutterTop]: gutterTop,
          [classes.gutterBottom]: gutterBottom,
        })}>
        {contributors.filter(filter || (() => true)).map(contrib => (
          <Grid key={contrib.login} item xs={4} sm={3}>
            <Anchor href={contrib.profile || '#'}>
              <Card>
                <CardActionArea className={classes.cardActionArea}>
                  <CardContent>
                    <Avatar
                      alt="avatar"
                      src={contrib.avatar_url}
                      className={classes.avatar}
                    />
                    <Typography variant="body2">
                      {contrib.name || contrib.login}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Anchor>
          </Grid>
        ))}
      </Grid>
    );
  }
}
