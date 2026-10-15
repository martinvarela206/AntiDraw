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
import addVertexToolSvg from '../assets/icons/add_vertex_tool.svg';
import alignBottomSvg from '../assets/icons/align_bottom.svg';
import alignCenterSvg from '../assets/icons/align_center.svg';
import alignLeftSvg from '../assets/icons/align_left.svg';
import alignMiddleSvg from '../assets/icons/align_middle.svg';
import alignRightSvg from '../assets/icons/align_right.svg';
import alignTopSvg from '../assets/icons/align_top.svg';
import bringForwardSvg from '../assets/icons/bring_forward.svg';
import bringFrontSvg from '../assets/icons/bring_front.svg';
import canvasToolSvg from '../assets/icons/canvas_tool.svg';
import chevronDownSvg from '../assets/icons/chevron_down.svg';
import circleToolSvg from '../assets/icons/circle_tool.svg';
import combineSvg from '../assets/icons/combine.svg';
import ellipseToolSvg from '../assets/icons/ellipse_tool.svg';
import eraserToolSvg from '../assets/icons/eraser_tool.svg';
import excludeSvg from '../assets/icons/exclude.svg';
import flipHorizontalSvg from '../assets/icons/flip_horizontal.svg';
import flipVerticalSvg from '../assets/icons/flip_vertical.svg';
import fragmentSvg from '../assets/icons/fragment.svg';
import gridVisibilitySvg from '../assets/icons/grid_visibility.svg';
import guideDoubleArrowVerticalLeftRotateSvg from '../assets/icons/guide_double_arrow_vertical_left_rotate.svg';
import guideDoubleArrowVerticalRightRotateSvg from '../assets/icons/guide_double_arrow_vertical_right_rotate.svg';
import guidesVisibilitySvg from '../assets/icons/guides_visibility.svg';
import intersectSvg from '../assets/icons/intersect.svg';
import knifeToolSvg from '../assets/icons/knife_tool.svg';
import layersSvg from '../assets/icons/layers.svg';
import lineToolSvg from '../assets/icons/line_tool.svg';
import nodeAsymmetricSvg from '../assets/icons/node_asymmetric.svg';
import nodeSharpSvg from '../assets/icons/node_sharp.svg';
import nodeSmoothSvg from '../assets/icons/node_smooth.svg';
import nodeSymmetricSvg from '../assets/icons/node_symmetric.svg';
import nodeToolSvg from '../assets/icons/node_tool.svg';
import penToolSvg from '../assets/icons/pen_tool.svg';
import polygonToolSvg from '../assets/icons/polygon_tool.svg';
import polylineToolSvg from '../assets/icons/polyline_tool.svg';
import rectToolSvg from '../assets/icons/rect_tool.svg';
import redoSvg from '../assets/icons/redo.svg';
import rulerCornerSvg from '../assets/icons/ruler_corner.svg';
import rulersVisibilitySvg from '../assets/icons/rulers_visibility.svg';
import scissorsToolSvg from '../assets/icons/scissors_tool.svg';
import selectToolSvg from '../assets/icons/select_tool.svg';
import sendBackSvg from '../assets/icons/send_back.svg';
import sendBackwardSvg from '../assets/icons/send_backward.svg';
import shapeBuilderToolSvg from '../assets/icons/shape_builder_tool.svg';
import smartFillToolSvg from '../assets/icons/smart_fill_tool.svg';
import snapAngularSvg from '../assets/icons/snap_angular.svg';
import snapEdgeSvg from '../assets/icons/snap_edge.svg';
import snapGridSvg from '../assets/icons/snap_grid.svg';
import snapGuideSvg from '../assets/icons/snap_guide.svg';
import snapPixelSvg from '../assets/icons/snap_pixel.svg';
import snapVertexSvg from '../assets/icons/snap_vertex.svg';
import snapViewBoxSvg from '../assets/icons/snap_view_box.svg';
import splitNodeSvg from '../assets/icons/split_node.svg';
import starToolSvg from '../assets/icons/star_tool.svg';
import strokeToolSvg from '../assets/icons/stroke_tool.svg';
import subtractSvg from '../assets/icons/subtract.svg';
import undoSvg from '../assets/icons/undo.svg';
import unionSvg from '../assets/icons/union.svg';
import zoomToolSvg from '../assets/icons/zoom_tool.svg';

export const ToolIcons = {
  addVertexTool: addVertexToolSvg,
  alignBottom: alignBottomSvg,
  alignCenter: alignCenterSvg,
  alignLeft: alignLeftSvg,
  alignMiddle: alignMiddleSvg,
  alignRight: alignRightSvg,
  alignTop: alignTopSvg,
  bringForward: bringForwardSvg,
  bringFront: bringFrontSvg,
  canvasTool: canvasToolSvg,
  chevronDown: chevronDownSvg,
  circleTool: circleToolSvg,
  combine: combineSvg,
  ellipseTool: ellipseToolSvg,
  eraserTool: eraserToolSvg,
  exclude: excludeSvg,
  flipHorizontal: flipHorizontalSvg,
  flipVertical: flipVerticalSvg,
  fragment: fragmentSvg,
  gridVisibility: gridVisibilitySvg,
  guideDoubleArrowVerticalLeftRotate: guideDoubleArrowVerticalLeftRotateSvg,
  guideDoubleArrowVerticalRightRotate: guideDoubleArrowVerticalRightRotateSvg,
  guidesVisibility: guidesVisibilitySvg,
  intersect: intersectSvg,
  knifeTool: knifeToolSvg,
  layers: layersSvg,
  lineTool: lineToolSvg,
  nodeAsymmetric: nodeAsymmetricSvg,
  nodeSharp: nodeSharpSvg,
  nodeSmooth: nodeSmoothSvg,
  nodeSymmetric: nodeSymmetricSvg,
  nodeTool: nodeToolSvg,
  penTool: penToolSvg,
  polygonTool: polygonToolSvg,
  polylineTool: polylineToolSvg,
  rectTool: rectToolSvg,
  redo: redoSvg,
  rulerCorner: rulerCornerSvg,
  rulersVisibility: rulersVisibilitySvg,
  scissorsTool: scissorsToolSvg,
  selectTool: selectToolSvg,
  sendBack: sendBackSvg,
  sendBackward: sendBackwardSvg,
  shapeBuilderTool: shapeBuilderToolSvg,
  smartFillTool: smartFillToolSvg,
  snapAngular: snapAngularSvg,
  snapEdge: snapEdgeSvg,
  snapGrid: snapGridSvg,
  snapGuide: snapGuideSvg,
  snapPixel: snapPixelSvg,
  snapVertex: snapVertexSvg,
  snapViewBox: snapViewBoxSvg,
  splitNode: splitNodeSvg,
  starTool: starToolSvg,
  strokeTool: strokeToolSvg,
  subtract: subtractSvg,
  undo: undoSvg,
  union: unionSvg,
  zoomTool: zoomToolSvg,
  select: selectToolSvg,
  stroke: strokeToolSvg,
  node: nodeToolSvg,
  pen: penToolSvg,
  line: lineToolSvg,
  polyline: polylineToolSvg,
  rect: rectToolSvg,
  circle: circleToolSvg,
  ellipse: ellipseToolSvg,
  polygon: polygonToolSvg,
  star: starToolSvg,
  addVertex: addVertexToolSvg,
  canvas: canvasToolSvg,
  zoom: zoomToolSvg,
  ruler: rulersVisibilitySvg,
  grid: gridVisibilitySvg,
  guide: guidesVisibilitySvg,
  doubleArrowLeftRotate: guideDoubleArrowVerticalLeftRotateSvg,
  doubleArrowRightRotate: guideDoubleArrowVerticalRightRotateSvg,
} as const;

export type ToolIconName = keyof typeof ToolIcons;
