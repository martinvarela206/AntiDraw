/**
 * ARCHITECTURAL RATIONALE: Centralized UI Icon Registry & SVG Asset Pipeline
 *
 * All icons stored in `src/webview/assets/icons/*.svg` are imported directly as raw SVG markup
 * via the esbuild text loader (`loader: { '.svg': 'text' }`).
 *
 * Benefits:
 * 1. Single Source of Truth: Editing, replacing, or adding any .svg file automatically updates the application
 *    bundle on compilation (`pnpm run build` / `pnpm run package`).
 * 2. Zero-Reflow / Zero-Latency: Injected synchronously into the DOM without async I/O or HTTP fetch.
 * 3. Geometry Extraction: Provides helper utilities to extract vector path data (`d="..."`) for canvas
 *    or inline overlay composition.
 */
import AddVertexToolSvg from '../../assets/icons/add_vertex_tool.svg';
import AlignBottomSvg from '../../assets/icons/align_bottom.svg';
import AlignCenterSvg from '../../assets/icons/align_center.svg';
import AlignLeftSvg from '../../assets/icons/align_left.svg';
import AlignMiddleSvg from '../../assets/icons/align_middle.svg';
import AlignRightSvg from '../../assets/icons/align_right.svg';
import AlignTopSvg from '../../assets/icons/align_top.svg';
import BringForwardSvg from '../../assets/icons/bring_forward.svg';
import BringFrontSvg from '../../assets/icons/bring_front.svg';
import CanvasToolSvg from '../../assets/icons/canvas_tool.svg';
import ChevronDownSvg from '../../assets/icons/chevron_down.svg';
import CircleToolSvg from '../../assets/icons/circle_tool.svg';
import CombineSvg from '../../assets/icons/combine.svg';
import EllipseToolSvg from '../../assets/icons/ellipse_tool.svg';
import EraserToolSvg from '../../assets/icons/eraser_tool.svg';
import ExcludeSvg from '../../assets/icons/exclude.svg';
import FlipHorizontalSvg from '../../assets/icons/flip_horizontal.svg';
import FlipVerticalSvg from '../../assets/icons/flip_vertical.svg';
import FragmentSvg from '../../assets/icons/fragment.svg';
import GridVisibilitySvg from '../../assets/icons/grid_visibility.svg';
import GuideDoubleArrowVerticalLeftRotateSvg from '../../assets/icons/guide_double_arrow_vertical_left_rotate.svg';
import GuideDoubleArrowVerticalRightRotateSvg from '../../assets/icons/guide_double_arrow_vertical_right_rotate.svg';
import GuidesVisibilitySvg from '../../assets/icons/guides_visibility.svg';
import IntersectSvg from '../../assets/icons/intersect.svg';
import KnifeToolSvg from '../../assets/icons/knife_tool.svg';
import LayersSvg from '../../assets/icons/layers.svg';
import LineToolSvg from '../../assets/icons/line_tool.svg';
import NodeAsymmetricSvg from '../../assets/icons/node_asymmetric.svg';
import NodeSharpSvg from '../../assets/icons/node_sharp.svg';
import NodeSmoothSvg from '../../assets/icons/node_smooth.svg';
import NodeSymmetricSvg from '../../assets/icons/node_symmetric.svg';
import NodeToolSvg from '../../assets/icons/node_tool.svg';
import PenToolSvg from '../../assets/icons/pen_tool.svg';
import PolygonToolSvg from '../../assets/icons/polygon_tool.svg';
import PolylineToolSvg from '../../assets/icons/polyline_tool.svg';
import RectToolSvg from '../../assets/icons/rect_tool.svg';
import RedoSvg from '../../assets/icons/redo.svg';
import RulerCornerSvg from '../../assets/icons/ruler_corner.svg';
import RulersVisibilitySvg from '../../assets/icons/rulers_visibility.svg';
import ScissorsToolSvg from '../../assets/icons/scissors_tool.svg';
import SelectToolSvg from '../../assets/icons/select_tool.svg';
import SendBackSvg from '../../assets/icons/send_back.svg';
import SendBackwardSvg from '../../assets/icons/send_backward.svg';
import ShapeBuilderToolSvg from '../../assets/icons/shape_builder_tool.svg';
import SmartFillToolSvg from '../../assets/icons/smart_fill_tool.svg';
import SnapAngularSvg from '../../assets/icons/snap_angular.svg';
import SnapEdgeSvg from '../../assets/icons/snap_edge.svg';
import SnapGridSvg from '../../assets/icons/snap_grid.svg';
import SnapGuideSvg from '../../assets/icons/snap_guide.svg';
import SnapPixelSvg from '../../assets/icons/snap_pixel.svg';
import SnapVertexSvg from '../../assets/icons/snap_vertex.svg';
import SnapViewBoxSvg from '../../assets/icons/snap_view_box.svg';
import SplitNodeSvg from '../../assets/icons/split_node.svg';
import StarToolSvg from '../../assets/icons/star_tool.svg';
import StrokeToolSvg from '../../assets/icons/stroke_tool.svg';
import SubtractSvg from '../../assets/icons/subtract.svg';
import UndoSvg from '../../assets/icons/undo.svg';
import UnionSvg from '../../assets/icons/union.svg';
import ZoomToolSvg from '../../assets/icons/zoom_tool.svg';

export const ICONS = {
  addVertexTool: AddVertexToolSvg,
  alignBottom: AlignBottomSvg,
  alignCenter: AlignCenterSvg,
  alignLeft: AlignLeftSvg,
  alignMiddle: AlignMiddleSvg,
  alignRight: AlignRightSvg,
  alignTop: AlignTopSvg,
  bringForward: BringForwardSvg,
  bringFront: BringFrontSvg,
  canvasTool: CanvasToolSvg,
  chevronDown: ChevronDownSvg,
  circleTool: CircleToolSvg,
  combine: CombineSvg,
  ellipseTool: EllipseToolSvg,
  eraserTool: EraserToolSvg,
  exclude: ExcludeSvg,
  flipHorizontal: FlipHorizontalSvg,
  flipVertical: FlipVerticalSvg,
  fragment: FragmentSvg,
  gridVisibility: GridVisibilitySvg,
  guideDoubleArrowVerticalLeftRotate: GuideDoubleArrowVerticalLeftRotateSvg,
  guideDoubleArrowVerticalRightRotate: GuideDoubleArrowVerticalRightRotateSvg,
  guidesVisibility: GuidesVisibilitySvg,
  intersect: IntersectSvg,
  knifeTool: KnifeToolSvg,
  layers: LayersSvg,
  lineTool: LineToolSvg,
  nodeAsymmetric: NodeAsymmetricSvg,
  nodeSharp: NodeSharpSvg,
  nodeSmooth: NodeSmoothSvg,
  nodeSymmetric: NodeSymmetricSvg,
  nodeTool: NodeToolSvg,
  penTool: PenToolSvg,
  polygonTool: PolygonToolSvg,
  polylineTool: PolylineToolSvg,
  rectTool: RectToolSvg,
  redo: RedoSvg,
  rulerCorner: RulerCornerSvg,
  rulersVisibility: RulersVisibilitySvg,
  scissorsTool: ScissorsToolSvg,
  selectTool: SelectToolSvg,
  sendBack: SendBackSvg,
  sendBackward: SendBackwardSvg,
  shapeBuilderTool: ShapeBuilderToolSvg,
  smartFillTool: SmartFillToolSvg,
  snapAngular: SnapAngularSvg,
  snapEdge: SnapEdgeSvg,
  snapGrid: SnapGridSvg,
  snapGuide: SnapGuideSvg,
  snapPixel: SnapPixelSvg,
  snapVertex: SnapVertexSvg,
  snapViewBox: SnapViewBoxSvg,
  splitNode: SplitNodeSvg,
  starTool: StarToolSvg,
  strokeTool: StrokeToolSvg,
  subtract: SubtractSvg,
  undo: UndoSvg,
  union: UnionSvg,
  zoomTool: ZoomToolSvg,
  select: SelectToolSvg,
  stroke: StrokeToolSvg,
  node: NodeToolSvg,
  pen: PenToolSvg,
  line: LineToolSvg,
  polyline: PolylineToolSvg,
  rect: RectToolSvg,
  circle: CircleToolSvg,
  ellipse: EllipseToolSvg,
  polygon: PolygonToolSvg,
  star: StarToolSvg,
  addVertex: AddVertexToolSvg,
  canvas: CanvasToolSvg,
  zoom: ZoomToolSvg,
  ruler: RulersVisibilitySvg,
  grid: GridVisibilitySvg,
  guide: GuidesVisibilitySvg,
  doubleArrowLeftRotate: GuideDoubleArrowVerticalLeftRotateSvg,
  doubleArrowRightRotate: GuideDoubleArrowVerticalRightRotateSvg,
} as const;

export type IconName = keyof typeof ICONS;

/**
 * Extracts the `d` attribute from an SVG path element in raw SVG text.
 */
export function extractSvgPathD(svgContent: string): string {
  const match = svgContent.match(/\bd=["']([^"']+)["']/i);
  return match ? match[1] : '';
}

/**
 * Renders an SVG icon with customizable attributes (e.g. classes, dimensions, colors).
 */
export function renderIcon(name: IconName, extraAttributes: string = ''): string {
  const raw = ICONS[name];
  if (!raw) return '';
  if (!extraAttributes) return raw;
  return raw.replace('<svg', `<svg ${extraAttributes}`);
}
