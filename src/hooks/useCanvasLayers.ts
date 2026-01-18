import { useRef, useEffect, useCallback } from 'react';

const CANVAS_SIZE = 1080;

export type Tool = 'brush';

interface UseCanvasLayersProps {
  color: string;
  tool: Tool;
  brushSize: number;
  onDrawingStart: () => void;
  onStrokeRecord?: (point: { x: number; y: number; timestamp: number; isFirst: boolean }) => void;
}

export function useCanvasLayers({ color, tool, brushSize, onDrawingStart, onStrokeRecord }: UseCanvasLayersProps) {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize canvas with proper DPR handling
  const initCanvas = useCallback((canvas: HTMLCanvasElement, isOffscreen = false) => {
    const dpr = window.devicePixelRatio || 1;
    
    // For display canvas, CSS size is handled by component styles
    // We only set the internal resolution here
    
    // Set actual size in memory (scaled by DPR for crisp rendering)
    // Internal resolution is always 1080x1080, scaled by DPR
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    // Scale context to match DPR so drawing coordinates match CANVAS_SIZE
    ctx.scale(dpr, dpr);
    
    return ctx;
  }, []);

  // Render composite: draw BASE then ACTIVE on top
  // Must be defined before useEffect that uses it
  const renderComposite = useCallback(() => {
    const displayCanvas = displayCanvasRef.current;
    const baseCanvas = baseCanvasRef.current;
    const activeCanvas = activeCanvasRef.current;
    
    if (!displayCanvas || !baseCanvas || !activeCanvas) return;
    
    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;
    
    // Clear display canvas with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    // Draw BASE layer
    ctx.drawImage(baseCanvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    // Draw ACTIVE layer on top
    ctx.drawImage(activeCanvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, []);

  // Initialize all canvases
  useEffect(() => {
    const init = () => {
      if (baseCanvasRef.current) {
        const ctx = initCanvas(baseCanvasRef.current, true);
        if (ctx) {
          // Initialize base canvas with white background
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        }
      }
      if (activeCanvasRef.current) {
        initCanvas(activeCanvasRef.current, true);
      }
      if (displayCanvasRef.current) {
        initCanvas(displayCanvasRef.current);
        // Render after a short delay to ensure all canvases are initialized
        setTimeout(() => {
          renderComposite();
        }, 0);
      }
    };
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(init);
  }, [initCanvas, renderComposite]);

  // Load base image from blob
  const loadBaseImage = useCallback(async (blob: Blob) => {
    const baseCanvas = baseCanvasRef.current;
    if (!baseCanvas) return;
    
    const ctx = baseCanvas.getContext('2d');
    if (!ctx) return;
    
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        renderComposite();
        resolve();
      };
      img.onerror = () => resolve();
      img.src = URL.createObjectURL(blob);
    });
  }, [renderComposite]);

  // Clear active layer
  const clearActive = useCallback(() => {
    const activeCanvas = activeCanvasRef.current;
    if (!activeCanvas) return;
    
    const ctx = activeCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    // Clear undo stack when clearing active layer
    undoStackRef.current = [];
    renderComposite();
  }, [renderComposite]);

  // Undo last drawing operation
  const undo = useCallback(() => {
    const activeCanvas = activeCanvasRef.current;
    if (!activeCanvas) return false;
    
    const ctx = activeCanvas.getContext('2d');
    if (!ctx) return false;
    
    if (undoStackRef.current.length === 0) return false;
    
    // Restore previous state
    const previousState = undoStackRef.current.pop();
    if (previousState) {
      // Clear canvas first
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      // Create temp canvas to restore the imageData, then draw it onto active canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = CANVAS_SIZE;
      tempCanvas.height = CANVAS_SIZE;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.putImageData(previousState, 0, 0);
        // Draw the temp canvas onto the active canvas (scaled by DPR automatically)
        ctx.drawImage(tempCanvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      }
      renderComposite();
      return true;
    }
    return false;
  }, [renderComposite]);

  // Merge active onto base
  const mergeLayers = useCallback(() => {
    const baseCanvas = baseCanvasRef.current;
    const activeCanvas = activeCanvasRef.current;
    if (!baseCanvas || !activeCanvas) return;
    
    const baseCtx = baseCanvas.getContext('2d');
    if (!baseCtx) return;
    
    // Draw active layer onto base
    baseCtx.drawImage(activeCanvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    // Clear active
    clearActive();
  }, [clearActive]);

  // Get coordinates relative to canvas (accounting for DPR and CSS scaling)
  const getCanvasCoordinates = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    
    // Get pointer position relative to canvas element
    // Map from display size (CSS pixels) to internal canvas size (1080x1080)
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE;
    
    return { x, y };
  }, []);

  // Draw continuous brush stroke
  const drawStroke = useCallback((x: number, y: number, isFirstPoint: boolean) => {
    const activeCanvas = activeCanvasRef.current;
    if (!activeCanvas) return;
    
    const ctx = activeCanvas.getContext('2d');
    if (!ctx) return;
    
    // Save state only on first point of stroke
    if (isFirstPoint) {
      // Save state before drawing
      // Since context is scaled by DPR, we need to work with the actual canvas size
      // But we want to save at logical size (1080x1080), so we'll use a temp canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = CANVAS_SIZE;
      tempCanvas.height = CANVAS_SIZE;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        // Draw current active canvas onto temp canvas at logical size
        tempCtx.drawImage(activeCanvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        const imageData = tempCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        undoStackRef.current.push(imageData);
      }
      onDrawingStart();
    }
    
    ctx.fillStyle = color;
    
    if (lastPointRef.current && !isFirstPoint) {
      // Draw line between last point and current point
      const dx = x - lastPointRef.current.x;
      const dy = y - lastPointRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        const steps = Math.ceil(distance / (brushSize / 4));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const px = lastPointRef.current.x + dx * t;
          const py = lastPointRef.current.y + dy * t;
          ctx.fillRect(
            px - brushSize / 2,
            py - brushSize / 2,
            brushSize,
            brushSize
          );
        }
      }
    } else {
      // Draw square at current position
      ctx.fillRect(
        x - brushSize / 2,
        y - brushSize / 2,
        brushSize,
        brushSize
      );
    }
    
    lastPointRef.current = { x, y };
    
    // Record stroke point for timelapse
    if (onStrokeRecord) {
      onStrokeRecord({
        x,
        y,
        timestamp: Date.now(),
        isFirst: isFirstPoint,
      });
    }
    
    // Update display
    renderComposite();
  }, [color, brushSize, onDrawingStart, onStrokeRecord, renderComposite]);

  // Handle pointer down (start drawing)
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = getCanvasCoordinates(e);
    if (coords) {
      isDrawingRef.current = true;
      lastPointRef.current = null; // Reset for new stroke
      drawStroke(coords.x, coords.y, true);
      // Capture pointer for move/up events (even outside canvas)
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        
        // Add global pointer up listener to catch release outside canvas
        const handleGlobalPointerUp = (event: PointerEvent) => {
          if (event.pointerId === e.pointerId) {
            isDrawingRef.current = false;
            lastPointRef.current = null;
            window.removeEventListener('pointerup', handleGlobalPointerUp);
            window.removeEventListener('pointercancel', handleGlobalPointerUp);
          }
        };
        
        window.addEventListener('pointerup', handleGlobalPointerUp);
        window.addEventListener('pointercancel', handleGlobalPointerUp);
      } catch (err) {
        // Ignore errors if pointer capture fails
      }
    }
  }, [getCanvasCoordinates, drawStroke]);

  // Handle pointer move (continue drawing)
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const coords = getCanvasCoordinates(e);
    if (coords) {
      drawStroke(coords.x, coords.y, false);
    }
  }, [getCanvasCoordinates, drawStroke]);

  // Handle pointer up (stop drawing)
  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawingRef.current) {
      e.preventDefault();
      isDrawingRef.current = false;
      lastPointRef.current = null;
      // Release pointer capture
      if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }
    }
  }, []);

  // Export merged canvas as PNG blob at exactly 1080x1080 resolution
  const exportAsBlob = useCallback(async (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const baseCanvas = baseCanvasRef.current;
      if (!baseCanvas) {
        reject(new Error('Base canvas not available'));
        return;
      }
      
      // Create a new canvas at exactly 1080x1080 for export
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = CANVAS_SIZE;
      exportCanvas.height = CANVAS_SIZE;
      const exportCtx = exportCanvas.getContext('2d');
      
      if (!exportCtx) {
        reject(new Error('Failed to create export context'));
        return;
      }
      
      // Draw the base canvas onto the export canvas at 1080x1080
      // The base canvas is scaled by DPR, so we need to scale it back down
      const dpr = window.devicePixelRatio || 1;
      exportCtx.drawImage(
        baseCanvas,
        0, 0, baseCanvas.width, baseCanvas.height, // Source: full DPR-scaled canvas
        0, 0, CANVAS_SIZE, CANVAS_SIZE // Destination: 1080x1080
      );
      
      exportCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to export canvas'));
        }
      }, 'image/png');
    });
  }, []);

  // Export as data URL (for download)
  const exportAsDataURL = useCallback((): string => {
    const baseCanvas = baseCanvasRef.current;
    if (!baseCanvas) return '';
    return baseCanvas.toDataURL('image/png');
  }, []);

  // Replay a stroke (for timelapse)
  const replayStroke = useCallback((stroke: { color: string; brushSize: number; points: Array<{ x: number; y: number }> }) => {
    const activeCanvas = activeCanvasRef.current;
    if (!activeCanvas) return;
    
    const ctx = activeCanvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = stroke.color;
    
    for (let i = 0; i < stroke.points.length; i++) {
      const point = stroke.points[i];
      const prevPoint = i > 0 ? stroke.points[i - 1] : null;
      
      if (prevPoint) {
        // Draw line between points
        const dx = point.x - prevPoint.x;
        const dy = point.y - prevPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
          const steps = Math.ceil(distance / (stroke.brushSize / 4));
          for (let j = 0; j <= steps; j++) {
            const t = j / steps;
            const px = prevPoint.x + dx * t;
            const py = prevPoint.y + dy * t;
            ctx.fillRect(
              px - stroke.brushSize / 2,
              py - stroke.brushSize / 2,
              stroke.brushSize,
              stroke.brushSize
            );
          }
        }
      } else {
        // First point
        ctx.fillRect(
          point.x - stroke.brushSize / 2,
          point.y - stroke.brushSize / 2,
          stroke.brushSize,
          stroke.brushSize
        );
      }
    }
    
    renderComposite();
  }, [renderComposite]);

  return {
    baseCanvasRef,
    activeCanvasRef,
    displayCanvasRef,
    loadBaseImage,
    clearActive,
    mergeLayers,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    exportAsBlob,
    exportAsDataURL,
    undo,
    replayStroke,
    renderComposite,
  };
}
