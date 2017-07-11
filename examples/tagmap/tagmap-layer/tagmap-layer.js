/* global window */
/* eslint-disable max-len */
import {CompositeLayer, IconLayer, WebMercatorViewport} from 'deck.gl';
import {makeTextureAtlasFromLabels} from './label-utils';
import TagMapConnector from './tagmap-connector';
import colorbrewer from 'colorbrewer';

const defaultProps = {
  getLabel: x => x.label,
  getWeight: x => x.weight,
  getPosition: x => x.coordinates,
  colorScheme: colorbrewer.YlGnBu[9].slice(1, 6).reverse(),
  minFontSize: 14,
  maxFontSize: 32,
  weightThreshold: 1
};

export default class TagmapLayer extends CompositeLayer {

  initializeState() {
    this.state = {};
  }

  shouldUpdateState({changeFlags}) {
    return changeFlags.somethingChanged;
  }

  updateState({props, oldProps, changeFlags}) {
    super.updateState({props, oldProps, changeFlags});

    if (changeFlags.dataChanged) {
      this.updateLabelAtlas();
      this.updateData();
      this.updateVis();
    } else if (changeFlags.viewportChanged ||
        props.minFontSize !== oldProps.minFontSize ||
        props.maxFontSize !== oldProps.maxFontSize ||
        props.weightThreshold !== oldProps.weightThreshold) {
      this.updateVis();
    }
  }

  updateLabelAtlas() {
    const {data, getLabel} = this.props;
    if (!data || data.length === 0) {
      return;
    }

    const {gl} = this.context;
    // font size for texture generation
    const fontSize = 32;
    // avoid generating duplicate labels
    const labels = Array.from(new Set(data.map(getLabel)));
    // use the texture generator from label layer
    // need to be optimized
    const {texture, mapping} = makeTextureAtlasFromLabels(gl, {data: labels, fontSize});

    // mappingDict -- key: label, val: mapping box in the texture
    const mappingDict = {};
    mapping.forEach((x, i) => {
      mappingDict[labels[i]] = x;
    });
    this.setState({texture, mapping: mappingDict});
  }

  updateData() {
    const {data, getLabel, getPosition, getWeight} = this.props;
    const tagMap = new TagMapConnector();
    tagMap.setData(data, {getLabel, getPosition, getWeight});
    this.setState({tagMap});
  }

  updateVis() {
    if (!this.state.tagMap) {
      return;
    }

    const {viewport} = this.context;
    const {minFontSize, maxFontSize, weightThreshold, colorScheme} = this.props;
    const transform = new WebMercatorViewport(Object.assign({}, viewport));

    this.state.tagMap.setVisParam({minFontSize, maxFontSize, weightThreshold, colorScheme});
    const tags = this.state.tagMap.getTags({transform, viewport});
    this.setState({tags});
  }

  renderLayers() {
    const {tags} = this.state;

    return [
      new IconLayer(Object.assign({}, this.props, {
        id: 'tag-map',
        iconAtlas: this.state.texture,
        iconMapping: this.state.mapping,
        data: tags,
        // weird scaling related to texture mapping and viewport change (pitch)
        sizeScale: window.devicePixelRatio * 1.25,
        getIcon: d => d.label,
        getPosition: d => d.position,
        getColor: d => d.color,
        getSize: d => d.size
      }))
    ];
  }
}

TagmapLayer.layerName = 'TagmapLayer';
TagmapLayer.defaultProps = defaultProps;
