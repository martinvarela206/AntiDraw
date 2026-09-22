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
import AddVertexSvg from '../../assets/icons/add_vertex.svg';
import AlignBottomSvg from '../../assets/icons/align_bottom.svg';
import AlignCenterSvg from '../../assets/icons/align_center.svg';
import AlignLeftSvg from '../../assets/icons/align_left.svg';
import AlignMiddleSvg from '../../assets/icons/align_middle.svg';
import AlignRightSvg from '../../assets/icons/align_right.svg';
import AlignTopSvg from '../../assets/icons/align_top.svg';
import BringForwardSvg from '../../assets/icons/bring_forward.svg';
import BringFrontSvg from '../../assets/icons/bring_front.svg';
import CanvasSvg from '../../assets/icons/canvas.svg';
import ChevronDownSvg from '../../assets/icons/chevron_down.svg';
import CircleSvg from '../../assets/icons/circle.svg';
import CombineSvg from '../../assets/icons/combine.svg';
import EllipseSvg from '../../assets/icons/ellipse.svg';
import ExcludeSvg from '../../assets/icons/exclude.svg';
import FlipHorizontalSvg from '../../assets/icons/flip_horizontal.svg';
import FlipVerticalSvg from '../../assets/icons/flip_vertical.svg';
import FragmentSvg from '../../assets/icons/fragment.svg';
import GridSvg from '../../assets/icons/grid.svg';
import GuideSvg from '../../assets/icons/guide.svg';
import GuideDoubleArrowVerticalLeftRotateSvg from '../../assets/icons/guide_double_arrow_vertical_left_rotate.svg';
import GuideDoubleArrowVerticalRightRotateSvg from '../../assets/icons/guide_double_arrow_vertical_right_rotate.svg';
import IntersectSvg from '../../assets/icons/intersect.svg';
import LineSvg from '../../assets/icons/line.svg';
import NodeSvg from '../../assets/icons/node.svg';
import NodeAsymmetricSvg from '../../assets/icons/node_asymmetric.svg';
import NodeSharpSvg from '../../assets/icons/node_sharp.svg';
import NodeSmoothSvg from '../../assets/icons/node_smooth.svg';
import NodeSymmetricSvg from '../../assets/icons/node_symmetric.svg';
import PenSvg from '../../assets/icons/pen.svg';
import PolygonSvg from '../../assets/icons/polygon.svg';
import PolylineSvg from '../../assets/icons/polyline.svg';
import RectSvg from '../../assets/icons/rect.svg';
import RedoSvg from '../../assets/icons/redo.svg';
import RulerSvg from '../../assets/icons/ruler.svg';
import RulerCornerSvg from '../../assets/icons/ruler_corner.svg';
import SelectSvg from '../../assets/icons/select.svg';
import SendBackSvg from '../../assets/icons/send_back.svg';
import SendBackwardSvg from '../../assets/icons/send_backward.svg';
import SnapAngularSvg from '../../assets/icons/snap_angular.svg';
import SnapEdgeSvg from '../../assets/icons/snap_edge.svg';
import SnapGridSvg from '../../assets/icons/snap_grid.svg';
import SnapGuideSvg from '../../assets/icons/snap_guide.svg';
import SnapVertexSvg from '../../assets/icons/snap_vertex.svg';
import SnapViewBoxSvg from '../../assets/icons/snap_view_box.svg';
import SplitNodeSvg from '../../assets/icons/split_node.svg';
import StarSvg from '../../assets/icons/star.svg';
import StrokeSvg from '../../assets/icons/stroke.svg';
import SubtractSvg from '../../assets/icons/subtract.svg';
import UndoSvg from '../../assets/icons/undo.svg';
import UnionSvg from '../../assets/icons/union.svg';
import ZoomSvg from '../../assets/icons/zoom.svg';

export const ICONS = {
  addVertex: AddVertexSvg,
  alignBottom: AlignBottomSvg,
  alignCenter: AlignCenterSvg,
  alignLeft: AlignLeftSvg,
  alignMiddle: AlignMiddleSvg,
  alignRight: AlignRightSvg,
  alignTop: AlignTopSvg,
  bringForward: BringForwardSvg,
  bringFront: BringFrontSvg,
  canvas: CanvasSvg,
  chevronDown: ChevronDownSvg,
  circle: CircleSvg,
  combine: CombineSvg,
  ellipse: EllipseSvg,
  exclude: ExcludeSvg,
  flipHorizontal: FlipHorizontalSvg,
  flipVertical: FlipVerticalSvg,
  fragment: FragmentSvg,
  grid: GridSvg,
  guide: GuideSvg,
  guideDoubleArrowVerticalLeftRotate: GuideDoubleArrowVerticalLeftRotateSvg,
  guideDoubleArrowVerticalRightRotate: GuideDoubleArrowVerticalRightRotateSvg,
  intersect: IntersectSvg,
  line: LineSvg,
  node: NodeSvg,
  nodeAsymmetric: NodeAsymmetricSvg,
  nodeSharp: NodeSharpSvg,
  nodeSmooth: NodeSmoothSvg,
  nodeSymmetric: NodeSymmetricSvg,
  pen: PenSvg,
  polygon: PolygonSvg,
  polyline: PolylineSvg,
  rect: RectSvg,
  redo: RedoSvg,
  ruler: RulerSvg,
  rulerCorner: RulerCornerSvg,
  select: SelectSvg,
  sendBack: SendBackSvg,
  sendBackward: SendBackwardSvg,
  snapAngular: SnapAngularSvg,
  snapEdge: SnapEdgeSvg,
  snapGrid: SnapGridSvg,
  snapGuide: SnapGuideSvg,
  snapVertex: SnapVertexSvg,
  snapViewBox: SnapViewBoxSvg,
  splitNode: SplitNodeSvg,
  star: StarSvg,
  stroke: StrokeSvg,
  subtract: SubtractSvg,
  undo: UndoSvg,
  union: UnionSvg,
  zoom: ZoomSvg,
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
