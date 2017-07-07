/* generate tagmap layout: an occlusion-free tagcloud-like visualization on map */
/* eslint-disable max-len */
/* global document */
import TagMapper from './tagmapper';
import {color} from 'd3-color';
import {scaleQuantile} from 'd3-scale';

export default class TagMapWrapper {
  constructor() {
    this.tagmapper = null;
    this.visParam = null;
    this.canvas = document.createElement('canvas');
  }

  setData(data, {getLabel, getPosition, getWeight}) {
    this.tagmapper = new TagMapper(this.sizeMeasurer);
    this.tagmapper.buildHierarchy(data, {getLabel, getPosition, getWeight});
  }

  setVisParam({minFontSize, maxFontSize, weightThreshold, colorScheme}) {
    this.visParam = {minFontSize, maxFontSize, weightThreshold, colorScheme};
  }

  getTags({transform, viewport}) {
    if (!this.tagmapper || !this.visParam) {
      throw new Error('TagMapWrapper not initialized');
    }

    const {minFontSize, maxFontSize, weightThreshold, colorScheme} = this.visParam;
    // const t0 = performance.now();
    this.tagmapper.extractCluster({transform, viewport}, weightThreshold);
    // const t1 = performance.now();
    const tags = this.tagmapper.layout({minFontSize, maxFontSize});
    // const t2 = performance.now();
    // console.log(`Call to extract cluster took ${Math.ceil(t1 - t0)} ms.`);
    // console.log(`Call to layout took ${Math.ceil(t2 - t1)} ms.`);

    // set color scheme
    const getColor = fontSize => {
      const hex = scaleQuantile().domain([minFontSize, maxFontSize]).range(colorScheme)(fontSize);
      const c = color(hex);
      return [c.r, c.g, c.b, c.opacity * 255];
    };

    // testing
    // console.log(transform.unproject([viewport.width, viewport.height]));
    // console.log(transform.unproject([0, 0]));
    // console.log(transform.unproject([0, viewport.height]));
    // console.log(transform.unproject([viewport.width, 0]));

    // transform tags to the format that is visualized as icons in the deckgl layer
    return tags.map(x => ({
      term: x.term,
      position: transform.unproject(x.center),
      size: x.height,
      color: getColor(x.height)
    }));
  }

  get sizeMeasurer() {
    return (fontSize, label) => {
      const ctx = this.canvas.getContext('2d');
      ctx.font = `${fontSize}px Verdana,Arial,sans-serif`;
      ctx.fillStyle = '#000';
      ctx.textBaseline = 'hanging';
      ctx.textAlign = 'left';
      const {width} = ctx.measureText(label);
      return {width, height: fontSize};
    };
  }

  // const {minFontSize, maxFontSize, weightThreshold, colorScheme} = visParam;
  // const sizeMeasurer = (fontSize, str) => measureTextWidth(canvas, fontSize, str);
  // const tagmapper = new TagMapper({sizeMeasurer, minFontSize, maxFontSize, weightThreshold});

  // tagmapper.buildHierarchy(data, {getLabel, getPosition, getWeight});
  // aggregate data
  // tagmapper.extractCluster(transform, viewport);
  // calculate layout
  // let tags = tagmapper.layout();
  //
  // tags = tags.map(x => ({
  //   term: x.term,
  //   position: transform.unproject(x.center),
  //   size: x.height,
  //   color: getColor(maxFontSize, minFontSize, colorScheme, x.height)
  // }));
  //
  // return {tags};
}

// function getColor(minFontSize, maxFontSize, colorScheme, fontSize) {
//   const hex = scaleQuantile().domain([minFontSize, maxFontSize]).range(colorScheme)(fontSize);
//   const c = color(hex);
//   return [c.r, c.g, c.b, c.opacity * 255];
// }

// return width and height of the label
// function measureTextWidth(canvas, fontSize, str) {
//   const ctx = canvas.getContext('2d');
//   ctx.font = `${fontSize}px Verdana,Arial,sans-serif`;
//   ctx.fillStyle = '#000';
//   ctx.textBaseline = 'hanging';
//   ctx.textAlign = 'left';
//   const {width} = ctx.measureText(str);
//   return {width, height: fontSize};
// }
