import { useRef, useEffect, useCallback } from 'react';

const CANVAS_SIZE = 1080;
const BRUSH_SIZE = 100;
const GRID_SIZE = 108; // 108px grid spacing

export type Tool = 'brush';

interface UseCanvasLayersProps {
  color: string;
  tool: Tool;
  onDab: () => void;
  onUndoDab?: () => void;
}

export function useCanvasLayers({ color, tool, onDab, onUndoDab }: UseCanvasLayersProps) {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const undoStackRef = useRef<ImageData[]>([]);

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

  // Draw grid reference on canvas
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = '#E0E0E0'; // Light grey
    ctx.lineWidth = 1;
    
    // Draw vertical lines
    for (let x = 0; x <= CANVAS_SIZE; x += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_SIZE);
      ctx.stroke();
    }
    
    // Draw horizontal lines
    for (let y = 0; y <= CANVAS_SIZE; y += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_SIZE, y);
      ctx.stroke();
    }
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
    
    // Draw grid reference on top (so it's always visible)
    drawGrid(ctx);
  }, [drawGrid]);

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
      ctx.putImageData(previousState, 0, 0);
      renderComposite();
      // Notify parent to restore a dab
      if (onUndoDab) {
        onUndoDab();
      }
      return true;
    }
    return false;
  }, [renderComposite, onUndoDab]);

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

  // Draw a dab (square brush)
  const drawDab = useCallback((x: number, y: number) => {
    const activeCanvas = activeCanvasRef.current;
    if (!activeCanvas) return;
    
    const ctx = activeCanvas.getContext('2d');
    if (!ctx) return;
    
    // Save current state for undo before drawing
    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    undoStackRef.current.push(imageData);
    
    // Draw filled square (centered on click position)
    ctx.fillStyle = color;
    ctx.fillRect(
      x - BRUSH_SIZE / 2,
      y - BRUSH_SIZE / 2,
      BRUSH_SIZE,
      BRUSH_SIZE
    );
    
    // Update display
    renderComposite();
    
    // Notify parent of dab
    onDab();
  }, [color, onDab, renderComposite]);

  // Handle pointer down (single dab)
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = getCanvasCoordinates(e);
    if (coords) {
      drawDab(coords.x, coords.y);
    }
  }, [getCanvasCoordinates, drawDab]);

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

  return {
    baseCanvasRef,
    activeCanvasRef,
    displayCanvasRef,
    loadBaseImage,
    clearActive,
    mergeLayers,
    handlePointerDown,
    exportAsBlob,
    exportAsDataURL,
    undo,
  };
}
