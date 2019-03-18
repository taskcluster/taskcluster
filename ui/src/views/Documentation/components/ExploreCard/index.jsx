import React from 'react';
import { func, string } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Card from '@material-ui/core/Card';
import Typography from '@material-ui/core/Typography';
import CardContent from '@material-ui/core/CardContent';
import CardActions from '@material-ui/core/CardActions';
import Button from '../../../../components/Button';
import Anchor from '../Anchor';

const useStyles = withStyles(theme => ({
  root: {
    position: 'relative',
    height: theme.spacing.unit * 25,
  },
  titleCardContent: {
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    marginLeft: theme.spacing.unit,
  },
  cardActions: {
    borderTop: `1px solid ${theme.palette.divider}`,
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
}));

function ExploreCard({ classes, to, title, description, icon, ...props }) {
  return (
    <Card classes={{ root: classes.root }} {...props}>
      <CardContent className={classes.titleCardContent}>
        {icon}
        <Typography variant="title" className={classes.title}>
          {title}
        </Typography>
      </CardContent>
      <CardContent>
        <Typography>{description}</Typography>
      </CardContent>
      <CardActions className={classes.cardActions}>
        <Button component={Anchor} href={to} size="small">
          See More
        </Button>
      </CardActions>
    </Card>
  );
}

ExploreCard.propTypes = {
  /** The title of the card. */
  title: string.isRequired,
  /** A short description of the card. */
  description: string.isRequired,
  /** An icon to use beside the title. */
  icon: func.isRequired,
  /** A path to follow when the action button is clicked. */
  to: string.isRequired,
};

export default useStyles(ExploreCard);
