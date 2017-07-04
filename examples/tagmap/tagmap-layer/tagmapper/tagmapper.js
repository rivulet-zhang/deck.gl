/* eslint-disable max-len */
import {scaleLog} from 'd3-scale';
import Tag from './tag';
import rbush from 'rbush';
import Clustering from 'density-clustering';

export default class TagMapper {

  constructor({sizeMeasurer, maxDist, minFontSize, maxFontSize, weightThreshold}) {
    this.tagmap = {};
    this.sizeMeasurer = sizeMeasurer;
    this.maxDist = maxDist;
    this.minFontSize = minFontSize;
    this.maxFontSize = maxFontSize;
    this.weightThreshold = weightThreshold;

    this.dbscan = new Clustering.DBSCAN();
  }

  aggregate(data, {getLabel, getPosition, getWeight}) {
    // clear tagmap
    this.tagmap = {};
    // group tags based on the content
    data.forEach(val => {
      const label = getLabel(val);
      if (!this.tagmap.hasOwnProperty(label)) {
        this.tagmap[label] = [];
      }
      this.tagmap[label].push({position: getPosition(val), weight: getWeight(val)});
    });
    // use dbscan to cluster tags
    for (const key in this.tagmap) {
      const positions = this.tagmap[key].map(val => val.position);
      const weights = this.tagmap[key].map(val => val.weight);
      const clusters = this.dbscan.run(positions, this.maxDist, 1);
      // val is a list of index to the points
      const tags = clusters.map(val => {
        const tag = new Tag(key);
        val.forEach(_val => {
          tag.add(positions[_val], weights[_val]);
        });
        return tag;
      });
      this.tagmap[key] = tags;
    }
  }

  _getSortedTags() {
    if (Object.keys(this.tagmap).length === 0) {
      return [];
    }
    return Object.values(this.tagmap).reduce((prev, curr) => prev.concat(curr))
      .filter(x => x.weight >= this.weightThreshold)
      .sort((a, b) => b.weight - a.weight || a.term.length - b.term.length);
  }

  _getScale(minWeight, maxWeight) {
    if (minWeight === maxWeight) {
      return x => (this.minFontSize + this.maxFontSize) * 0.5;
    }
    // set log scale for label size
    return scaleLog().base(Math.E)
                      .domain([minWeight, maxWeight])
                      .range([this.minFontSize, this.maxFontSize]);
  }

  // center is two element array
  _rotate(center, angle, radius) {
    const radian = angle / 180.0 * Math.PI;
    const x = Math.cos(radian) * radius + center[0];
    const y = Math.sin(radian) * radius + center[1];
    return [x, y];
  }

  // a greedy circular layout method
  _placeTag(placedTag, tree, tag) {
    let angle = -90.0;
    const deltaAngle = 25;
    let radius = 3.0;
    const deltaRadius = 1.0;
    let iter = 0;
    const iterThreshold = 12;

    const center = tag.center.slice();
    while (iter <= iterThreshold) {
      // calculate the new candidate position
      const p = this._rotate(center, angle, radius);
      tag.setCenter(p);
      const bbox = {
        minX: p[0] - tag.width * 0.5,
        maxX: p[0] + tag.width * 0.5,
        minY: p[1] - tag.height * 0.5,
        maxY: p[1] + tag.height * 0.5
      };
      // if no collision, position the tag
      if (!tree.collides(bbox)) {
        placedTag.push(tag);
        tree.insert(bbox);
        break;
      }
      // increment angle and radius
      angle += deltaAngle;
      radius += deltaRadius;
      iter++;
    }
  }

  layout() {
    // get tags in descending order
    const tags = this._getSortedTags();
    if (!tags) {
      return [];
    }
    // get scale function to calculate size of label bounding box
    const weights = tags.map(x => x.weight);
    const minWeight = Math.min.apply(null, weights);
    const maxWeight = Math.max.apply(null, weights);

    // calculate bounding box
    tags.forEach(x => {
      const fontSize = this._getScale(minWeight, maxWeight)(x.weight);
      const {width, height} = this.sizeMeasurer(fontSize, x.term);
      x.setSize(width, height);
    });

    // run actual layout algorithm
    const placedTag = [];
    const tree = rbush();
    tags.forEach(x => this._placeTag(placedTag, tree, x));

    return placedTag;
  }
}
