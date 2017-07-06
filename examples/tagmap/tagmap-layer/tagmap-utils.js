/* generate tagmap layout: an occlusion-free tagcloud-like visualization on map */
/* eslint-disable max-len */
import TagMapper from './tagmapper';
import {color} from 'd3-color';
import {scaleQuantile} from 'd3-scale';

export function tagmapLayout(data, {transform, viewport}, canvas, {getLabel, getPosition, getWeight}, visParam) {

  const {minFontSize, maxFontSize, weightThreshold, colorScheme} = visParam;
  const sizeMeasurer = (fontSize, str) => measureTextWidth(canvas, fontSize, str);
  const tagmapper = new TagMapper({sizeMeasurer, minFontSize, maxFontSize, weightThreshold});

  tagmapper.buildHierarchy(data, {getLabel, getPosition, getWeight});
  // aggregate data
  // tagmapper.aggregate(data, {getLabel, getPosition, getWeight});
  tagmapper.extractCluster(transform, viewport);
  // calculate layout
  let tags = tagmapper.layout();

  tags = tags.map(x => ({
    term: x.term,
    position: transform.unproject(x.center),
    size: x.height,
    color: getColor(maxFontSize, minFontSize, colorScheme, x.height)
  }));

  return {tags};
}

function getColor(minFontSize, maxFontSize, colorScheme, fontSize) {
  const hex = scaleQuantile().domain([minFontSize, maxFontSize]).range(colorScheme)(fontSize);
  const c = color(hex);
  return [c.r, c.g, c.b, c.opacity * 255];
}

// return width and height of the label
function measureTextWidth(canvas, fontSize, str) {
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px Verdana,Arial,sans-serif`;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'hanging';
  ctx.textAlign = 'left';
  const {width} = ctx.measureText(str);
  return {width, height: fontSize};
}
