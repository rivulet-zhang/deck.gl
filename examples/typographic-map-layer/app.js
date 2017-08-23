/* global window,document */
/* eslint-disable max-len */
import React, {Component} from 'react';
import {render} from 'react-dom';
import MapGL from 'react-map-gl';
import DeckGLOverlay from './deckgl-overlay.js';
import {fromJS} from 'immutable';
import {json as requestJson} from 'd3-request';
import Stats from 'stats.js';

// Set your mapbox token here
const MAPBOX_TOKEN = process.env.MapboxAccessToken; // eslint-disable-line
// mapbox style file path
const MAPBOX_STYLE_FILE = 'https://rivulet-zhang.github.io/dataRepo/mapbox/style/map-style-dark-v9-no-labels.json';
// sample data
const FILE_PATH = 'https://raw.githubusercontent.com/uber-common/deck.gl-data/master/website/bart.geo.json';

class Root extends Component {

  constructor(props) {
    super(props);
    this.state = {
      viewport: {
        ...DeckGLOverlay.defaultViewport,
        width: 500,
        height: 500
      }
    };
    this._loadMapStyle();
    this._loadData();
  }

  componentWillMount() {
    window.addEventListener('resize', this._resize.bind(this));
    this._resize();
  }
  componentDidMount() {
    this._loadData();

    // performace monitoring panel
    this._stats = new Stats();
    this._stats.showPanel(0);
    this.refs.fps.appendChild(this._stats.dom);

    const calcFPS = () => {
      this._stats.begin();
      this._stats.end();
      this._animateRef = window.requestAnimationFrame(calcFPS);
    };
    window.requestAnimationFrame(calcFPS);
  }

  componentWillUnmount() {
    if (this._animateRef) {
      window.cancelAnimationFrame(this._animateRef);
    }
  }

  _onViewportChange(viewport) {
    this.setState({
      viewport: {...this.state.viewport, ...viewport}
    });
  }

  _loadMapStyle() {
    requestJson(MAPBOX_STYLE_FILE, (error, response) => {
      if (!error) {
        const mapStyle = fromJS(response);
        this.setState({mapStyle});
      } else {
        throw new Error(error.toString());
      }
    });
  }

  // specification: https://github.com/uber/deck.gl/blob/master/src/layers/core/geojson-layer/geojson.js
  _loadData() {
    requestJson(FILE_PATH, (error, response) => {
      if (!error) {
        let lineStrings = [];
        let polygons = [];
        response.features.forEach(val => {
          switch (val.geometry.type) {
          case 'LineString':
            lineStrings.push(val.geometry.coordinates);
            break;
          case 'MultiLineString':
            lineStrings = lineStrings.concat(val.geometry.coordinates);
            break;
          case 'Polygon':
          case 'MultiPolygon':
            polygons = polygons.concat(val.geometry.coordinates);
            break;
          default:
            break;
          }
        });
        this.setState({lineStrings, polygons});
      }
    });
  }

  _resize() {
    this._onViewportChange({
      width: window.innerWidth,
      height: window.innerHeight
    });
  }

  render() {
    const {viewport, mapStyle, lineStrings, polygons} = this.state;

    return (
      <div>
        <MapGL
          {...viewport}
          mapStyle={mapStyle}
          preventStyleDiffing={true}
          onViewportChange={this._onViewportChange.bind(this)}
          mapboxApiAccessToken={MAPBOX_TOKEN}>
          <DeckGLOverlay
            viewport={viewport}
            lineStrings={lineStrings}
            polygons={polygons}
          />
        </MapGL>
        <div ref="fps" className="fps" />
      </div>
    );
  }
}

render(<Root />, document.body.appendChild(document.createElement('div')));
