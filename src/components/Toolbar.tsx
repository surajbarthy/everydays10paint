import type { Tool } from '../hooks/useCanvasLayers';

const COLOR_PALETTE = [
  '#000000', // black
  '#FFFFFF', // white
  '#FF0000', // red
  '#00FF00', // green
  '#0000FF', // blue
  '#FFFF00', // yellow
  '#FF00FF', // magenta
  '#00FFFF', // cyan
  '#FFA500', // orange
  '#800080', // purple
  '#FFC0CB', // pink
  '#A52A2A', // brown
];

interface ToolbarProps {
  color: string;
  tool: Tool;
  dabsLeft: number;
  isLocked: boolean;
  hasDabs: boolean;
  onColorChange: (color: string) => void;
  onToolChange: (tool: Tool) => void;
  onDone: () => void;
  onNextPerson: () => void;
  onReset: () => void;
  onUndo: () => void;
}

export default function Toolbar({
  color,
  tool,
  dabsLeft,
  isLocked,
  hasDabs,
  onColorChange,
  onToolChange,
  onDone,
  onNextPerson,
  onReset,
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
        <h3>Tools</h3>
        <div className="tools">
          <button
            className={`tool-button ${tool === 'brush' ? 'active' : ''}`}
            onClick={() => onToolChange('brush')}
            disabled={isLocked || dabsLeft === 0}
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
        <div className="dabs-counter">
          <strong>Dabs left: {dabsLeft}</strong>
        </div>
      </div>

      <div className="toolbar-section">
        <div className="turn-controls">
          <button
            className="action-button done-button"
            onClick={onDone}
            disabled={isLocked || !hasDabs || dabsLeft === 10}
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

      <div className="toolbar-section">
        <button
          className="action-button reset-button"
          onClick={onReset}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
