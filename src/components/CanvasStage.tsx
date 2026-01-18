import { RefObject, useState, useEffect } from 'react';

interface CanvasStageProps {
  baseCanvasRef: RefObject<HTMLCanvasElement>;
  activeCanvasRef: RefObject<HTMLCanvasElement>;
  displayCanvasRef: RefObject<HTMLCanvasElement>;
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  disabled: boolean;
  brushSize: number;
  brushColor: string;
}

export default function CanvasStage({
  baseCanvasRef,
  activeCanvasRef,
  displayCanvasRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  disabled,
  brushSize,
  brushColor,
}: CanvasStageProps) {
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const [cursorBrushSize, setCursorBrushSize] = useState(brushSize);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const canvas = displayCanvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Check if mouse is within canvas bounds
      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        setCursorPosition({ x: e.clientX, y: e.clientY });
        setIsHovering(true);
        
        // Calculate the scale factor: canvas internal size (1080) vs display size
        const scaleFactor = rect.width / 1080;
        // Scale the brush size to match what will actually be drawn visually
        setCursorBrushSize(brushSize * scaleFactor);
      } else {
        setIsHovering(false);
      }
    };

    const handleMouseLeave = () => {
      setIsHovering(false);
    };

    const canvas = displayCanvasRef.current;
    if (canvas && !disabled) {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseleave', handleMouseLeave);
      
      // Also update size when brush size changes
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0) {
        const scaleFactor = rect.width / 1080;
        setCursorBrushSize(brushSize * scaleFactor);
      }
      
      return () => {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
      };
    }
  }, [displayCanvasRef, disabled, brushSize]);

  return (
    <div className="canvas-container">
      {/* Hidden canvases for BASE and ACTIVE layers */}
      <canvas
        ref={baseCanvasRef}
        style={{ display: 'none' }}
        width={1080}
        height={1080}
      />
      <canvas
        ref={activeCanvasRef}
        style={{ display: 'none' }}
        width={1080}
        height={1080}
      />
      
      {/* Display canvas (composite of BASE + ACTIVE) */}
      <canvas
        ref={displayCanvasRef}
        className="display-canvas"
        onPointerDown={disabled ? undefined : onPointerDown}
        onPointerMove={disabled ? undefined : onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          cursor: 'none', // Hide default cursor
          touchAction: 'none',
          display: 'block',
        }}
        width={1080}
        height={1080}
      />
      
      {/* Custom brush cursor preview */}
      {!disabled && isHovering && (
        <div
          className="brush-cursor"
          style={{
            position: 'fixed',
            left: `${cursorPosition.x}px`,
            top: `${cursorPosition.y}px`,
            width: `${cursorBrushSize}px`,
            height: `${cursorBrushSize}px`,
            backgroundColor: brushColor,
            border: '1px solid rgba(0, 0, 0, 0.3)',
            pointerEvents: 'none',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            boxShadow: '0 0 4px rgba(0, 0, 0, 0.2)',
          }}
        />
      )}
    </div>
  );
}
