import React, {Component} from 'react';
import {setParameters} from 'luma.gl';
import DeckGL, {PathLayer} from 'deck.gl';
// import TextLayer from './text-layer';
// import Path from 'paths-js/path';
// import SVG from 'svg.js';

export default class DeckGLOverlay extends Component {

  // constructor() {
  //   const div = document.createElement('div');
  //   div.id = 'hidden';
  //   const draw = SVG('hidden').size(1000, 1000);
  //   this.state = {draw};
  // }

  static get defaultViewport() {
    return {
      // 37.759517, -122.439669
      latitude: 37.76,
      longitude: -122.44,
      zoom: 12,
      maxZoom: 16,
      pitch: 0,
      bearing: 0
    };
  }

  _initialize(gl) {
    setParameters(gl, {
      blendFunc: [gl.SRC_ALPHA, gl.ONE, gl.ONE_MINUS_DST_ALPHA, gl.ONE],
      blendEquation: gl.FUNC_ADD
    });
  }

  render() {

    // const {draw} = this.state;
    // const rect = draw.rect(100, 100).attr({fill: '#f06'});

    const {viewport, lineStrings} = this.props;

    const layers = [
      new PathLayer({
        id: 'path-layer',
        data: lineStrings,
        rounded: true,
        getPath: d => d,
        getWidth: d => 1,
        getColor: d => [255, 150, 150, 255],
        widthScale: 100
      })
    ];

    return (
      <DeckGL {...viewport} layers={layers} onWebGLInitialized={this._initialize} />
    );
  }
}
