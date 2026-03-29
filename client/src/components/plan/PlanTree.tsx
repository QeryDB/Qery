import { useRef, useState, useCallback, useEffect, type MouseEvent } from 'react';
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlanNodeCard } from './PlanNodeCard';
import type { PlanNode } from '@/types/execution-plan';

interface Props {
  node: PlanNode;
  totalCost: number;
}

/**
 * Each tree node is a <table> row:
 *   [Card TD] [Connector TD] [Children TD]
 *
 * Tables guarantee nested content expands the parent.
 */
function TreeNode({ node, totalCost }: Props) {
  const hasChildren = node.children.length > 0;
  const multipleChildren = node.children.length > 1;

  return (
    <table style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
      <tbody>
        <tr>
          {/* Card cell */}
          <td style={{ verticalAlign: 'middle', padding: 0 }}>
            <PlanNodeCard node={node} totalCost={totalCost} />
          </td>

          {/* Connector cell */}
          {hasChildren && (
            <td style={{ verticalAlign: 'middle', padding: 0, width: 24 }}>
              <div style={{ width: 24, height: 1, backgroundColor: 'var(--border)' }} />
            </td>
          )}

          {/* Children cell */}
          {hasChildren && (
            <td style={{ verticalAlign: 'middle', padding: 0 }}>
              <table style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
                <tbody>
                  {node.children.map((child, i) => (
                    <tr key={child.nodeId}>
                      {/* Vertical rail + horizontal branch */}
                      {multipleChildren && (
                        <td style={{ verticalAlign: 'middle', padding: 0, width: 16, position: 'relative' }}>
                          {/* Horizontal tick */}
                          <div style={{ width: 16, height: 1, backgroundColor: 'var(--border)' }} />
                          {/* Vertical rail segment */}
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              width: 1,
                              backgroundColor: 'var(--border)',
                              top: i === 0 ? '50%' : 0,
                              bottom: i === node.children.length - 1 ? '50%' : 0,
                            }}
                          />
                        </td>
                      )}
                      <td style={{ verticalAlign: 'middle', padding: i > 0 ? '4px 0 0 0' : 0 }}>
                        <TreeNode node={child} totalCost={totalCost} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

export function PlanTree({ node, totalCost }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Fit tree into viewport
  const fitToScreen = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    // Measure content at scale 1
    const prevTransform = content.style.transform;
    content.style.transform = 'scale(1)';
    const cw = content.scrollWidth;
    const ch = content.scrollHeight;
    content.style.transform = prevTransform;

    const vw = container.clientWidth - 16; // padding
    const vh = container.clientHeight - 16;
    if (cw === 0 || ch === 0) return;

    const scale = Math.min(vw / cw, vh / ch, 1); // never zoom in beyond 100%
    const clampedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));

    // Center
    const scaledW = cw * clampedScale;
    const scaledH = ch * clampedScale;
    const offsetX = (vw - scaledW) / 2;
    const offsetY = (vh - scaledH) / 2;

    setZoom(clampedScale);
    setPan({ x: Math.max(0, offsetX), y: Math.max(0, offsetY) });
  }, []);

  // Auto-fit on first render and when node changes
  useEffect(() => {
    // Slight delay to let the tree render
    const id = requestAnimationFrame(() => fitToScreen());
    return () => cancelAnimationFrame(id);
  }, [node, fitToScreen]);

  const handleZoomIn = () => {
    setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  };

  const handleZoomOut = () => {
    setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Wheel / trackpad zoom — native listener for proper preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      // Pinch-to-zoom (ctrlKey) uses finer delta; two-finger scroll uses coarser
      const sensitivity = e.ctrlKey ? 0.002 : 0.003;
      const delta = -e.deltaY * sensitivity;
      setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta)));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Pan with left-click drag anywhere on the canvas
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return; // left button only
    // Don't start pan if clicking interactive elements (buttons, expandable details)
    const target = e.target as HTMLElement;
    if (target.closest('button, a, [role="button"], details, summary')) return;
    e.preventDefault();
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({
        x: panStart.current.panX + dx,
        y: panStart.current.panY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning]);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      {/* Zoom controls — top-right */}
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg border bg-background/90 backdrop-blur-sm shadow-sm px-1 py-0.5"
      >
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomOut} title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[10px] text-muted-foreground w-8 text-center tabular-nums">{zoomPercent}%</span>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomIn} title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fitToScreen} title="Fit to screen">
          <Maximize className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleReset} title="Reset (100%)">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Pannable + zoomable canvas */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          cursor: isPanning ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
      >
        <div
          ref={contentRef}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            display: 'inline-block',
            padding: 8,
          }}
        >
          <TreeNode node={node} totalCost={totalCost} />
        </div>
      </div>
    </div>
  );
}
