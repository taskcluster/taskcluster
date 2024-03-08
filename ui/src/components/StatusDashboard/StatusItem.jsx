import React, { useState, useEffect } from 'react';
import { Paper, Typography } from '@material-ui/core';

const getLength = value => String(value).length;
const MiniSvgGraph = ({ data, width = 130, height = 72 }) => {
  const [path, setPath] = useState('');
  const [max, setMax] = useState(0);
  const [min, setMin] = useState(0);

  useEffect(() => {
    const max = Math.max(1, Math.max(...data)); // avoid divide by 0
    const min = Math.min(...data);
    const path = data
      .map((value, index) => {
        const x = (width * index) / (data.length - 1);
        const y = height - (height * value) / max;

        return `${x},${y}`;
      })
      .join(' ');

    setPath(path);
    setMax(max);
    setMin(min);
  }, [data, width, height]);

  return (
    <svg width={width + 18} height={height}>
      <polyline
        points={path}
        fill="none"
        stroke="#FF4500"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x={width + 18}
        y={height - 5}
        fill="#ff8877"
        fontSize="10px"
        textAnchor="end">
        {min}
      </text>
      <text
        x={width + 18}
        y={8}
        fill="#ff8877"
        fontSize="10px"
        textAnchor="end">
        {max}
      </text>
    </svg>
  );
};

/* eslint-disable import/prefer-default-export */
export const StatusItem = ({
  title,
  type,
  value,
  classMain,
  classValue,
  hint,
  error,
  altColor = false,
  tiny = false,
}) => {
  const [styles, setStyles] = useState({});

  useEffect(() => {
    setStyles({ backgroundColor: '#A459D1' });
    setTimeout(() => setStyles({}), 2000);
  }, [value]);

  const graphHeight = tiny ? 54 : 72;
  const titleVariant = tiny ? 'h6' : 'h5';
  const valueVariantMax = tiny ? 'h4' : 'h2';
  const valueVariantMin = tiny ? 'h5' : 'h4';

  return (
    <Paper className={classMain} style={styles}>
      <Typography variant={titleVariant}>
        {title}
        {hint && (
          <abbr title={hint} style={{ marginLeft: 5 }}>
            ?
          </abbr>
        )}
      </Typography>
      <abbr title={error}>
        {type === 'graph' && (
          <MiniSvgGraph
            data={value}
            className={classValue}
            height={graphHeight}
          />
        )}
        {(!type || type !== 'graph') && (
          <Typography
            className={classValue}
            style={altColor ? { color: '#51e9f1' } : {}}
            variant={getLength(value) < 10 ? valueVariantMax : valueVariantMin}>
            {value}
          </Typography>
        )}
      </abbr>
    </Paper>
  );
};
