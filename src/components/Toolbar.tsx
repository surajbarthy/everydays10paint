import type { Tool } from '../hooks/useCanvasLayers';

const COLOR_PALETTE = [
  // Row 1: Grayscale/Dark Tones
  '#FFFFFF', // white
  '#E4E4E4', // light gray
  '#888888', // medium gray
  '#222222', // dark gray/near black
  // Row 2: Warm Tones
  '#FFA7D1', // light pink
  '#E50000', // bright red
  '#E59500', // orange
  '#A06A42', // brown
  // Row 3: Green/Cyan Tones
  '#E5D900', // yellow
  '#94E044', // lime green
  '#02BE01', // bright green
  '#00D3DD', // cyan/bright aqua
  // Row 4: Blue/Purple Tones
  '#0083C7', // medium blue
  '#0000EA', // bright blue
  '#CF6EE4', // lavender/light purple
  '#820080', // dark purple/magenta
];

interface ToolbarProps {
  color: string;
  tool: Tool;
  brushSize: number;
  brushSizes: number[];
  timeLeft: number;
  isLocked: boolean;
  hasDrawing: boolean;
  onColorChange: (color: string) => void;
  onToolChange: (tool: Tool) => void;
  onBrushSizeChange: (size: number) => void;
  onDone: () => void;
  onNextPerson: () => void;
  onUndo: () => void;
}

export default function Toolbar({
  color,
  tool,
  brushSize,
  brushSizes,
  timeLeft,
  isLocked,
  hasDrawing,
  onColorChange,
  onToolChange,
  onBrushSizeChange,
  onDone,
  onNextPerson,
  onUndo,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <h3>Color Palette</h3>
        <div className="color-palette">
          {COLOR_PALETTE.map((paletteColor) => (
            <button
              key={paletteColor}
              className={`color-swatch ${color === paletteColor ? 'active' : ''}`}
              style={{ backgroundColor: paletteColor }}
              onClick={() => onColorChange(paletteColor)}
              title={paletteColor}
              disabled={isLocked}
            />
          ))}
        </div>
      </div>

      <div className="toolbar-section">
        <h3>Brush Size</h3>
        <div className="brush-sizes">
          {brushSizes.map((size) => (
            <button
              key={size}
              className={`brush-size-button ${brushSize === size ? 'active' : ''}`}
              onClick={() => onBrushSizeChange(size)}
              disabled={isLocked || timeLeft <= 0}
              title={`${size}px`}
            >
              <div 
                className="brush-size-shape"
                style={{
                  width: `${Math.min(size / 3, 40)}px`,
                  height: `${Math.min(size / 3, 40)}px`,
                }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-section">
        <h3>Tools</h3>
        <div className="tools">
          <button
            className={`tool-button ${tool === 'brush' ? 'active' : ''}`}
            onClick={() => onToolChange('brush')}
            disabled={isLocked || timeLeft <= 0}
          >
            Brush
          </button>
          <button
            className="tool-button undo-button"
            onClick={onUndo}
            disabled={isLocked}
          >
            Undo
          </button>
        </div>
        <div className="current-selection">
          <span>Selected: Brush</span>
          <span className="color-indicator" style={{ backgroundColor: color }} />
        </div>
      </div>

      <div className="toolbar-section">
        <div className="timer-counter">
          <strong>Time left: {timeLeft.toFixed(1)}s</strong>
          {timeLeft <= 0 && !isLocked && (
            <p className="timer-expired">Time's up!</p>
          )}
        </div>
      </div>

      <div className="toolbar-section">
        <div className="turn-controls">
          <button
            className="action-button done-button"
            onClick={onDone}
            disabled={isLocked || !hasDrawing}
          >
            Done
          </button>
          {isLocked && (
            <div className="locked-message">
              <p>Locked. Hand to the next person.</p>
              <button
                className="action-button next-button"
                onClick={onNextPerson}
              >
                Next Person
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
