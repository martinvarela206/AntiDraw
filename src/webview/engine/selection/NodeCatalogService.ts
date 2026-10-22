import { VectorElement, Point } from '../VectorModel.js';
import { BoundingBoxCalculator } from '../geometry/BoundingBoxCalculator.js';

export interface NodeCatalogOptions {
  excludeIds?: string[];
  includeSelfId?: string;
  structural?: boolean;
  handles?: boolean;
  positional?: boolean;
}

/**
 * ARCHITECTURAL RATIONALE: Tri-Tier Vector Node Snapping Catalog (NodeCatalogService)
 *
 * 1. Tri-Tier Node Hierarchy:
 *    Every vector element in AntiDraw exposes three distinct categories of magnetic landmarks:
 *    - Structural Nodes: Topological vertices fundamental to the existence of the path/geometry.
 *      In freeform paths and polylines, these vertices can be freely moved and deformed.
 *    - Handle Nodes: Parametric shape-defining controllers that modulate specific geometric invariants
 *      (ellipse start/end arc angles, ring/donut inner hole ratios, rectangle rounded corner radii,
 *      and star/polygon edge depth ratios).
 *    - Positional Nodes: Fixed referential landmarks that do not deform the shape on their own but
 *      anchor it in Euclidean 2D space (canonical quadrants 0°, 90°, 180°, 270° on outer and inner
 *      boundaries, geometric centers (cx, cy), and bounding box cardinal points).
 *
 * 2. High-Performance Landmark Harvesting:
 *    Caches coordinates analytically using vector attributes to prevent excessive DOM reflows
 *    or path deserialization cycles during high-frequency pointer movement.
 *
 * 3. Decoupled Architectural Layering:
 *    Centralizes node collection into a single cohesive service so that all tools (Pen, Polyline,
 *    Shape, Node, Translate, Scale, Rotate, Guide) maintain 100% feature and snapping parity.
 */
export class NodeCatalogService {
  public static collectSnappableNodes(
    elements: VectorElement[],
    options: NodeCatalogOptions = {}
  ): Point[] {
    const pts: Point[] = [];
    const excludeSet = new Set(options.excludeIds || []);
    const includeStructural = options.structural !== false;
    const includeHandles = options.handles !== false;
    const includePositional = options.positional !== false;

    for (const el of elements) {
      if (excludeSet.has(el.id)) continue;

      // Group Container Recursion
      if (el.tagName === 'g' && el.children && el.children.length > 0) {
        pts.push(...this.collectSnappableNodes(el.children, options));
        continue;
      }

      // 1. Structural Nodes (Topology vertices)
      if (includeStructural && el.vertices && el.vertices.length > 0) {
        for (const v of el.vertices) {
          pts.push({ x: v.x, y: v.y });
        }
      }

      // 2. Parametric Handle Nodes & 3. Positional Nodes for Ellipses, Circles, Arcs, and Rings
      const isEllipse =
        el.tagName === 'circle' ||
        el.tagName === 'ellipse' ||
        el.shapeType === 'circle' ||
        el.shapeType === 'ellipse' ||
        el.attributes?.['data-shape'] === 'circle' ||
        el.attributes?.['data-shape'] === 'ellipse' ||
        el.attributes?.['data-ellipse-type'] !== undefined ||
        el.attributes?.['data-primitive'] === 'ellipse' ||
        el.attributes?.['data-primitive'] === 'circle';
      if (isEllipse) {
        const cx = parseFloat(el.attributes.cx || '0');
        const cy = parseFloat(el.attributes.cy || '0');
        const rx = parseFloat(el.attributes.rx || el.attributes.r || '1');
        const ry = parseFloat(el.attributes.ry || el.attributes.r || '1');
        const startAngle = parseFloat(el.attributes['data-start-angle'] || '0');
        const endAngle = parseFloat(el.attributes['data-end-angle'] || '360');
        const innerRatio = parseFloat(el.attributes['data-inner-ratio'] || '0');
        const type = (el.attributes['data-ellipse-type'] as 'ellipse' | 'pie' | 'arc') || 'ellipse';

        // Positional: Canonical Center
        if (includePositional) {
          pts.push({ x: cx, y: cy });

          // Positional: 4 Canonical Outer Quadrants (0°, 90°, 180°, 270°)
          const cardinalAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
          for (const rad of cardinalAngles) {
            pts.push({
              x: cx + rx * Math.cos(rad),
              y: cy + ry * Math.sin(rad),
            });
          }

          // Positional: 4 Canonical Inner Quadrants if ring/donut has inner hole
          if (innerRatio > 0) {
            for (const rad of cardinalAngles) {
              pts.push({
                x: cx + rx * innerRatio * Math.cos(rad),
                y: cy + ry * innerRatio * Math.sin(rad),
              });
            }
          }
        }

        // Handles: Start Angle & End Angle Circumference Handles
        if (includeHandles) {
          const sRad = (startAngle * Math.PI) / 180;
          pts.push({
            x: cx + rx * Math.cos(sRad),
            y: cy + ry * Math.sin(sRad),
          });

          const eRad = (endAngle * Math.PI) / 180;
          pts.push({
            x: cx + rx * Math.cos(eRad),
            y: cy + ry * Math.sin(eRad),
          });

          // Handles: Inner Hole Handle (positioned along mid-angle ray, or at cx,cy if hole is 0)
          if (innerRatio > 0) {
            const isFull = type === 'ellipse' || Math.abs(endAngle - startAngle) >= 360;
            let midAngle: number;
            if (isFull) {
              midAngle = 0;
            } else {
              let sweep = endAngle - startAngle;
              while (sweep < 0) sweep += 360;
              while (sweep > 360) sweep -= 360;
              midAngle = startAngle + sweep / 2;
            }
            const midRad = (midAngle * Math.PI) / 180;
            pts.push({
              x: cx + rx * innerRatio * Math.cos(midRad),
              y: cy + ry * innerRatio * Math.sin(midRad),
            });
          } else {
            // When innerRatio <= 0, the inner hole handle is stationed directly at the canonical center
            pts.push({ x: cx, y: cy });
          }
        }
      }

      // 2. Parametric Handle Nodes & 3. Positional Nodes for Rectangles
      const isRect =
        el.tagName === 'rect' ||
        el.shapeType === 'rect' ||
        el.attributes?.['data-shape'] === 'rect' ||
        el.attributes?.['data-primitive'] === 'rect';
      if (isRect) {
        const x = parseFloat(el.attributes.x || '0');
        const y = parseFloat(el.attributes.y || '0');
        const w = parseFloat(el.attributes.width || '100');
        const h = parseFloat(el.attributes.height || '100');

        if (includePositional) {
          // Bounding Box 4 Corners
          pts.push({ x, y });
          pts.push({ x: x + w, y });
          pts.push({ x: x + w, y: y + h });
          pts.push({ x, y: y + h });

          // Bounding Box 4 Edge Midpoints
          pts.push({ x: x + w / 2, y });
          pts.push({ x: x + w, y: y + h / 2 });
          pts.push({ x: x + w / 2, y: y + h });
          pts.push({ x, y: y + h / 2 });

          // Center
          pts.push({ x: x + w / 2, y: y + h / 2 });
        }

        if (includeHandles) {
          const rxVal = parseFloat(el.attributes.rx || el.attributes['data-corner-tl'] || '0');
          const ryVal = parseFloat(el.attributes.ry || el.attributes['data-corner-tr'] || '0');
          const r = Math.max(rxVal, ryVal);
          const effR = Math.max(14, Math.min(r, w / 3, h / 3));
          pts.push({ x: x + effR, y: y + effR });
          pts.push({ x: x + w - effR, y: y + effR });
          pts.push({ x: x + w - effR, y: y + h - effR });
          pts.push({ x: x + effR, y: y + h - effR });
        }
      }

      // 2. Parametric Handle Nodes & 3. Positional Nodes for Stars & Regular Polygons
      const isStar =
        el.attributes?.['data-shape'] === 'star' ||
        el.attributes?.['data-shape'] === 'polygon' ||
        el.attributes?.['data-primitive'] === 'star' ||
        el.attributes?.['data-primitive'] === 'polygon';
      if (isStar) {
        const cx = parseFloat(el.attributes.cx || '0');
        const cy = parseFloat(el.attributes.cy || '0');
        const rx = parseFloat(el.attributes.rx || el.attributes.r || '50');
        const ry = parseFloat(el.attributes.ry || el.attributes.r || '50');
        const points = Math.max(
          3,
          Math.min(
            64,
            parseInt(
              el.attributes['data-star-points'] ||
                el.attributes['data-polygon-sides'] ||
                el.attributes['points'] ||
                '5',
              10
            )
          )
        );
        const regularRatio = Math.cos(Math.PI / points);
        const innerRatio = parseFloat(
          el.attributes['data-star-inner-ratio'] ||
            el.attributes['innerRatio'] ||
            regularRatio.toString()
        );

        if (includePositional) {
          pts.push({ x: cx, y: cy });
        }

        if (includeHandles && points >= 3) {
          const step = Math.PI / points;
          const handleAngle = -Math.PI / 2 + step;
          pts.push({
            x: cx + rx * innerRatio * Math.cos(handleAngle),
            y: cy + ry * innerRatio * Math.sin(handleAngle),
          });
        }
      }

      // General Bounding Box Center for Free Paths
      if (!isEllipse && !isRect && !isStar && includePositional && el.vertices && el.vertices.length > 0) {
        const box = BoundingBoxCalculator.getBoundingBox(el);
        if (box && box.width > 0 && box.height > 0) {
          pts.push({ x: box.cx, y: box.cy });
          pts.push({ x: box.x, y: box.y });
          pts.push({ x: box.x + box.width, y: box.y });
          pts.push({ x: box.x + box.width, y: box.y + box.height });
          pts.push({ x: box.x, y: box.y + box.height });
        }
      }
    }

    return pts;
  }
}
