/* eslint-disable max-len */
import {scaleLog} from 'd3-scale';
import Tag from './tag';
import rbush from 'rbush';
import Clustering from 'density-clustering';
import ClusterTree from 'hdbscanjs';

export default class TagMapper {
  constructor({sizeMeasurer, minFontSize, maxFontSize, weightThreshold}) {
    this.tagTree = {};
    this.tagmap = {};
    this.sizeMeasurer = sizeMeasurer;
    this.minFontSize = minFontSize;
    this.maxFontSize = maxFontSize;
    this.weightThreshold = weightThreshold;

    this.dbscan = new Clustering.DBSCAN();
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

  extractCluster(transform, viewport) {
    // clear tagmap
    this.tagmap = {};
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
        const pointInViewport = p => p[0] >= 0 && p[0] <= viewport.width && p[1] >= 0 && p[1] <= viewport.height;
        const bboxOverlapViewport = corners.some(p => {
          const pixel = transform.project(p);
          return pointInViewport(pixel);
        });
        // a cluster of a single point
        if (val.isLeaf) {
          return bboxOverlapViewport;
        }
        // test the cluster does not split under the current zoom level
        const cp0 = transform.project(val.edge[0]);
        const cp1 = transform.project(val.edge[1]);
        const distLTthres = Math.sqrt(Math.pow((cp0[0] - cp1[0]), 2) + Math.pow((cp0[1] - cp1[1]), 2)) < TagMapper.maxDist;
        return bboxOverlapViewport && distLTthres;
      });

      // generate tags which passed the test
      const tags = flagCluster.map(val => {
        const tag = new Tag(key);
        val.data.forEach((p, i) => tag.add(p, val.opt[i]));
        tag.setCenter(transform.project(tag.center));
        return tag;
      });
      this.tagmap[key] = tags;
    }
  }

  // aggregate(data, {getLabel, getPosition, getWeight}) {
  //   // clear tagmap
  //   this.tagmap = {};
  //   // group tags based on the content
  //   data.forEach(val => {
  //     const label = getLabel(val);
  //     if (!this.tagmap.hasOwnProperty(label)) {
  //       this.tagmap[label] = [];
  //     }
  //     this.tagmap[label].push({position: getPosition(val), weight: getWeight(val)});
  //   });
  //   // use dbscan to cluster tags
  //   for (const key in this.tagmap) {
  //     const positions = this.tagmap[key].map(val => val.position);
  //     const weights = this.tagmap[key].map(val => val.weight);
  //     const clusters = this.dbscan.run(positions, TagMapper.maxDist, 1);
  //     // val is a list of index to the points
  //     const tags = clusters.map(val => {
  //       const tag = new Tag(key);
  //       val.forEach(_val => {
  //         tag.add(positions[_val], weights[_val]);
  //       });
  //       return tag;
  //     });
  //     this.tagmap[key] = tags;
  //   }
  // }

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

  // screen-space aggregation threshold: invisible to the user
  static get maxDist() {
    return 20;
  }
}
