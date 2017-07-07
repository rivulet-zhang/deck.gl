/* eslint-disable max-len */
import {scaleLog} from 'd3-scale';
import Tag from './tag';
import rbush from 'rbush';
import ClusterTree from 'hdbscanjs';

export default class TagMapper {
  constructor(sizeMeasurer) {
    this.tagTree = {};
    this.tagMap = [];
    this.sizeMeasurer = sizeMeasurer;
  }

  buildHierarchy(data, {getLabel, getPosition, getWeight}) {
    // clear tree
    this.tagTree = {};
    // group tags based on the content
    data.forEach(val => {
      const label = getLabel(val);
      if (!this.tagTree.hasOwnProperty(label)) {
        this.tagTree[label] = [];
      }
      this.tagTree[label].push({data: getPosition(val), opt: getWeight(val)});
    });
    for (const key in this.tagTree) {
      const cluster = new ClusterTree(this.tagTree[key]);
      this.tagTree[key] = cluster.getTree();
    }
  }

  extractCluster({transform, viewport}, weightThreshold) {
    // clear tagMap
    this.tagMap = [];
    for (const key in this.tagTree) {
      const tree = this.tagTree[key];
      const flagCluster = tree.filter(val => {
        // test the cluster overlaps with the node
        const corners = [
          [val.bbox.minX, val.bbox.minY],
          [val.bbox.minX, val.bbox.maxY],
          [val.bbox.maxX, val.bbox.minY],
          [val.bbox.maxX, val.bbox.maxY]
        ];
        const bboxOverlapViewport = corners.some(p => {
          const pixel = transform.project(p);
          return pixel[0] >= 0 && pixel[0] <= viewport.width && pixel[1] >= 0 && pixel[1] <= viewport.height;
        });
        // a cluster of a single point or cluster outside the viewport
        if (val.isLeaf || !bboxOverlapViewport) {
          return bboxOverlapViewport;
        }
        // test the cluster does not split under the current zoom level
        const cp0 = transform.project(val.edge[0]);
        const cp1 = transform.project(val.edge[1]);
        return Math.sqrt(Math.pow((cp0[0] - cp1[0]), 2) + Math.pow((cp0[1] - cp1[1]), 2)) < TagMapper.maxDist;
      });

      // generate tags which passed the test and weightThreshold
      const tags = flagCluster.map(val => {
        const tag = new Tag(key);
        val.data.forEach((p, i) => tag.add(p, val.opt[i]));
        tag.setCenter(transform.project(tag.center));
        return tag;
      }).filter(val => val.weight >= weightThreshold);

      this.tagMap = this.tagMap.concat(tags);
    }
  }

  _getScale(minWeight, maxWeight, minFontSize, maxFontSize) {
    if (minWeight === maxWeight) {
      return x => (minFontSize + maxFontSize) * 0.5;
    }
    // set log scale for label size
    return scaleLog().base(Math.E)
                      .domain([minWeight, maxWeight])
                      .range([minFontSize, maxFontSize]);
  }

  // center is two element array
  _rotate(center, angle, radius) {
    const radian = angle / 180.0 * Math.PI;
    const x = Math.cos(radian) * radius + center[0];
    const y = Math.sin(radian) * radius + center[1];
    return [x, y];
  }

  _forcePlaceTag(placedTag, tree, tag) {
    placedTag.push(tag);
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

  layout({minFontSize, maxFontSize}) {
    if (!this.tagMap) {
      return [];
    }
    // get tags in descending order
    const orderedTags = this.tagMap.sort((a, b) => b.weight - a.weight || a.term.length - b.term.length);
    // get scale function to calculate size of label bounding box
    const minWeight = orderedTags[orderedTags.length - 1].weight;
    const maxWeight = orderedTags[0].weight;

    // calculate bounding box
    orderedTags.forEach(x => {
      const fontSize = this._getScale(minWeight, maxWeight, minFontSize, maxFontSize)(x.weight);
      const {width, height} = this.sizeMeasurer(fontSize, x.term);
      x.setSize(width, height);
    });

    // run actual layout algorithm
    const placedTag = [];
    const tree = rbush();
    orderedTags.forEach(x => this._placeTag(placedTag, tree, x));

    return placedTag;
  }

  layoutPlain({minFontSize, maxFontSize}) {
    if (!this.tagMap || this.tagMap.length === 0) {
      return [];
    }
    // get tags in descending order
    const orderedTags = this.tagMap.sort((a, b) => b.weight - a.weight || a.term.length - b.term.length);
    // get scale function to calculate size of label bounding box
    const minWeight = orderedTags[orderedTags.length - 1].weight;
    const maxWeight = orderedTags[0].weight;

    // calculate bounding box
    orderedTags.forEach(x => {
      const fontSize = this._getScale(minWeight, maxWeight, minFontSize, maxFontSize)(x.weight);
      const {width, height} = this.sizeMeasurer(fontSize, x.term);
      x.setSize(width, height);
    });

    return orderedTags;

  }

  // screen-space aggregation threshold: invisible to the user
  static get maxDist() {
    return 20;
  }
}
