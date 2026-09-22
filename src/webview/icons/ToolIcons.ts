/**
 * ARCHITECTURAL RATIONALE: Centralized SVG Vector Asset Import Pipeline
 *
 * Why this architecture was chosen:
 * 1. Independent Vector Asset Files: All vector icons are decoupled from TypeScript strings
 *    and stored as pure, editable W3C SVG files in `src/webview/assets/icons/`.
 *    This allows direct editing, previewing, and asset maintenance in vector editors without modifying code.
 * 2. Zero-Runtime-Latency Bundling: Powered by esbuild text loader (`loader: { '.svg': 'text' }`),
 *    each SVG file is imported and inlined directly at build time into `dist/webview.js`.
 *    This eliminates asynchronous network fetch delays, cross-origin restrictions in VS Code webviews,
 *    and layout reflows during toolbar rendering.
 * 3. Strict Parity & Non-Regression Invariant: Retains 100% API compatibility across all UI panels,
 *    toolbars, inspectors, and quick-help components.
 */
import addVertexSvg from '../assets/icons/add_vertex.svg';
import alignBottomSvg from '../assets/icons/align_bottom.svg';
import alignCenterSvg from '../assets/icons/align_center.svg';
import alignLeftSvg from '../assets/icons/align_left.svg';
import alignMiddleSvg from '../assets/icons/align_middle.svg';
import alignRightSvg from '../assets/icons/align_right.svg';
import alignTopSvg from '../assets/icons/align_top.svg';
import bringForwardSvg from '../assets/icons/bring_forward.svg';
import bringFrontSvg from '../assets/icons/bring_front.svg';
import canvasSvg from '../assets/icons/canvas.svg';
import chevronDownSvg from '../assets/icons/chevron_down.svg';
import circleSvg from '../assets/icons/circle.svg';
import combineSvg from '../assets/icons/combine.svg';
import doubleArrowLeftRotateSvg from '../assets/icons/double_arrow_vertical_left_rotate.svg';
import doubleArrowRightRotateSvg from '../assets/icons/double_arrow_vertical_right_rotate.svg';
import ellipseSvg from '../assets/icons/ellipse.svg';
import excludeSvg from '../assets/icons/exclude.svg';
import flipHorizontalSvg from '../assets/icons/flip_horizontal.svg';
import flipVerticalSvg from '../assets/icons/flip_vertical.svg';
import fragmentSvg from '../assets/icons/fragment.svg';
import gridSvg from '../assets/icons/grid.svg';
import guideSvg from '../assets/icons/guide.svg';
import intersectSvg from '../assets/icons/intersect.svg';
import lineSvg from '../assets/icons/line.svg';
import nodeSvg from '../assets/icons/node.svg';
import nodeAsymmetricSvg from '../assets/icons/node_asymmetric.svg';
import nodeSharpSvg from '../assets/icons/node_sharp.svg';
import nodeSmoothSvg from '../assets/icons/node_smooth.svg';
import nodeSymmetricSvg from '../assets/icons/node_symmetric.svg';
import penSvg from '../assets/icons/pen.svg';
import polygonSvg from '../assets/icons/polygon.svg';
import polylineSvg from '../assets/icons/polyline.svg';
import rectSvg from '../assets/icons/rect.svg';
import redoSvg from '../assets/icons/redo.svg';
import rulerSvg from '../assets/icons/ruler.svg';
import rulerCornerSvg from '../assets/icons/ruler_corner.svg';
import selectSvg from '../assets/icons/select.svg';
import sendBackSvg from '../assets/icons/send_back.svg';
import sendBackwardSvg from '../assets/icons/send_backward.svg';
import snapAngularSvg from '../assets/icons/snap_angular.svg';
import snapEdgeSvg from '../assets/icons/snap_edge.svg';
import snapGridSvg from '../assets/icons/snap_grid.svg';
import snapGuideSvg from '../assets/icons/snap_guide.svg';
import snapVertexSvg from '../assets/icons/snap_vertex.svg';
import snapViewBoxSvg from '../assets/icons/snap_view_box.svg';
import splitNodeSvg from '../assets/icons/split_node.svg';
import starSvg from '../assets/icons/star.svg';
import strokeSvg from '../assets/icons/stroke.svg';
import subtractSvg from '../assets/icons/subtract.svg';
import undoSvg from '../assets/icons/undo.svg';
import unionSvg from '../assets/icons/union.svg';
import zoomSvg from '../assets/icons/zoom.svg';

export const ToolIcons = {
  addVertex: addVertexSvg,
  alignBottom: alignBottomSvg,
  alignCenter: alignCenterSvg,
  alignLeft: alignLeftSvg,
  alignMiddle: alignMiddleSvg,
  alignRight: alignRightSvg,
  alignTop: alignTopSvg,
  bringForward: bringForwardSvg,
  bringFront: bringFrontSvg,
  canvas: canvasSvg,
  chevronDown: chevronDownSvg,
  circle: circleSvg,
  combine: combineSvg,
  doubleArrowLeftRotate: doubleArrowLeftRotateSvg,
  doubleArrowRightRotate: doubleArrowRightRotateSvg,
  ellipse: ellipseSvg,
  exclude: excludeSvg,
  flipHorizontal: flipHorizontalSvg,
  flipVertical: flipVerticalSvg,
  fragment: fragmentSvg,
  grid: gridSvg,
  guide: guideSvg,
  intersect: intersectSvg,
  line: lineSvg,
  node: nodeSvg,
  nodeAsymmetric: nodeAsymmetricSvg,
  nodeSharp: nodeSharpSvg,
  nodeSmooth: nodeSmoothSvg,
  nodeSymmetric: nodeSymmetricSvg,
  pen: penSvg,
  polygon: polygonSvg,
  polyline: polylineSvg,
  rect: rectSvg,
  redo: redoSvg,
  ruler: rulerSvg,
  rulerCorner: rulerCornerSvg,
  select: selectSvg,
  sendBack: sendBackSvg,
  sendBackward: sendBackwardSvg,
  snapAngular: snapAngularSvg,
  snapEdge: snapEdgeSvg,
  snapGrid: snapGridSvg,
  snapGuide: snapGuideSvg,
  snapVertex: snapVertexSvg,
  snapViewBox: snapViewBoxSvg,
  splitNode: splitNodeSvg,
  star: starSvg,
  stroke: strokeSvg,
  subtract: subtractSvg,
  undo: undoSvg,
  union: unionSvg,
  zoom: zoomSvg,
} as const;

export type ToolIconName = keyof typeof ToolIcons;
