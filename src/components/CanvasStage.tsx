import { RefObject } from 'react';

interface CanvasStageProps {
  baseCanvasRef: RefObject<HTMLCanvasElement>;
  activeCanvasRef: RefObject<HTMLCanvasElement>;
  displayCanvasRef: RefObject<HTMLCanvasElement>;
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  disabled: boolean;
}

export default function CanvasStage({
  baseCanvasRef,
  activeCanvasRef,
  displayCanvasRef,
  onPointerDown,
  disabled,
}: CanvasStageProps) {
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
        style={{
          cursor: disabled ? 'not-allowed' : 'crosshair',
          touchAction: 'none',
          display: 'block',
        }}
        width={1080}
        height={1080}
      />
    </div>
  );
}
