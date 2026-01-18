import { useState, useEffect, useRef, useCallback } from 'react';
import CanvasStage from './components/CanvasStage';
import Toolbar from './components/Toolbar';
import { useCanvasLayers, type Tool } from './hooks/useCanvasLayers';
import {
  loadCanvas,
  saveCanvas,
  saveHistory,
  clearAll,
  saveStroke,
  getStrokesForTurn,
  getAllStrokes,
  type Stroke,
} from './utils/db';
import './App.css';

const TIME_LIMIT = 10; // 10 seconds

const BRUSH_SIZES = [10, 50, 100]; // Three brush sizes

function App() {
  const [color, setColor] = useState('#222222'); // Default to dark grey/black from palette
  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(50); // Default to middle brush size
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [isLocked, setIsLocked] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [turnNumber, setTurnNumber] = useState(0);
  const canvasInitialized = useRef(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentStrokeRef = useRef<{
    id: string;
    turnNumber: number;
    startTime: number;
    color: string;
    brushSize: number;
    points: Array<{ x: number; y: number; timestamp: number }>;
  } | null>(null);

  // Start timer when drawing begins
  function onDrawingStart() {
    if (isLocked || isTimerRunning || timeLeft <= 0) return;
    
    if (!isTimerRunning && timeLeft === TIME_LIMIT) {
      // First stroke - start the timer
      setIsTimerRunning(true);
      setHasDrawing(true);
      
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 0.1) {
            // Timer expired
            setIsTimerRunning(false);
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            return 0;
          }
          return Math.max(0, prev - 0.1);
        });
      }, 100); // Update every 100ms for smooth countdown
    } else {
      setHasDrawing(true);
    }
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Stop timer when time runs out
  useEffect(() => {
    if (timeLeft <= 0 && isTimerRunning) {
      setIsTimerRunning(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }, [timeLeft, isTimerRunning]);

  // Handle stroke recording for timelapse
  function handleStrokeRecord(point: { x: number; y: number; timestamp: number; isFirst: boolean }) {
    if (isLocked) return;

    if (point.isFirst) {
      // Start a new stroke
      const strokeId = `${turnNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      currentStrokeRef.current = {
        id: strokeId,
        turnNumber,
        startTime: point.timestamp,
        color,
        brushSize,
        points: [],
      };
      console.log('Started new stroke:', strokeId, 'turn:', turnNumber);
    }

    // Add point to current stroke
    if (currentStrokeRef.current) {
      currentStrokeRef.current.points.push({
        x: point.x,
        y: point.y,
        timestamp: point.timestamp,
      });
    }
  }

  // Save current stroke when drawing ends
  async function saveCurrentStroke() {
    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
      const stroke: Stroke = {
        id: currentStrokeRef.current.id,
        turnNumber: currentStrokeRef.current.turnNumber,
        timestamp: currentStrokeRef.current.startTime,
        color: currentStrokeRef.current.color,
        brushSize: currentStrokeRef.current.brushSize,
        points: currentStrokeRef.current.points,
      };
      console.log('Saving stroke:', stroke.id, 'points:', stroke.points.length, 'turn:', stroke.turnNumber);
      try {
        await saveStroke(stroke);
        console.log('Stroke saved successfully');
      } catch (error) {
        console.error('Error saving stroke:', error);
      }
      currentStrokeRef.current = null;
    } else {
      console.log('No stroke to save or stroke has no points');
    }
  }

  const {
    baseCanvasRef,
    activeCanvasRef,
    displayCanvasRef,
    loadBaseImage,
    clearActive,
    mergeLayers,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: handlePointerUpOriginal,
    exportAsBlob,
    undo,
    replayStroke,
    renderComposite,
  } = useCanvasLayers({ color, tool, brushSize, onDrawingStart, onStrokeRecord: handleStrokeRecord });

  // Wrap pointer up to save stroke
  const handlePointerUp = useCallback(async (e: React.PointerEvent<HTMLCanvasElement>) => {
    handlePointerUpOriginal(e);
    // Save stroke when pointer is released
    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
      const stroke: Stroke = {
        id: currentStrokeRef.current.id,
        turnNumber: currentStrokeRef.current.turnNumber,
        timestamp: currentStrokeRef.current.startTime,
        color: currentStrokeRef.current.color,
        brushSize: currentStrokeRef.current.brushSize,
        points: currentStrokeRef.current.points,
      };
      console.log('Saving stroke on pointer up:', stroke.id, 'points:', stroke.points.length);
      try {
        await saveStroke(stroke);
        console.log('Stroke saved on pointer up');
      } catch (error) {
        console.error('Error saving stroke on pointer up:', error);
      }
      currentStrokeRef.current = null;
    }
  }, [handlePointerUpOriginal]);

  // Load canvas on mount
  useEffect(() => {
    async function initCanvas() {
      if (canvasInitialized.current) return;
      canvasInitialized.current = true;

      // Wait a bit for canvases to be initialized
      await new Promise(resolve => setTimeout(resolve, 200));

      try {
        const { baseImage, turnNumber: loadedTurn } = await loadCanvas();
        setTurnNumber(loadedTurn);

        if (baseImage) {
          await loadBaseImage(baseImage);
        }
      } catch (error) {
        console.error('Error loading canvas:', error);
      }
    }
    initCanvas();
  }, [loadBaseImage]);

  // Handle Done button
  async function handleDone() {
    if (isLocked || !hasDrawing) return;

    // Stop timer if running
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsTimerRunning(false);

    // Save any remaining stroke
    await saveCurrentStroke();

    // Merge active layer onto base
    mergeLayers();

    // Wait a brief moment to ensure merge is complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Export and save
    const newTurnNumber = turnNumber + 1;
    const blob = await exportAsBlob();

    // Generate filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `canvas_turn_${String(newTurnNumber).padStart(3, '0')}_${timestamp}.png`;

    // Download the canvas screenshot
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Export strokes for this turn
    const turnStrokes = await getStrokesForTurn(turnNumber);
    if (turnStrokes.length > 0) {
      const strokeExportData = {
        metadata: {
          exportDate: now.toISOString(),
          turnNumber: turnNumber,
          totalStrokes: turnStrokes.length,
          canvasSize: 1080,
          description: `Stroke data for turn ${turnNumber}. Each stroke contains points with timestamps in milliseconds since epoch.`,
        },
        strokes: turnStrokes,
      };
      
      const strokeDataStr = JSON.stringify(strokeExportData, null, 2);
      const strokeDataBlob = new Blob([strokeDataStr], { type: 'application/json' });
      const strokeUrl = URL.createObjectURL(strokeDataBlob);
      const strokeA = document.createElement('a');
      strokeA.href = strokeUrl;
      strokeA.download = `strokes_turn_${String(turnNumber).padStart(3, '0')}_${timestamp}.json`;
      document.body.appendChild(strokeA);
      strokeA.click();
      document.body.removeChild(strokeA);
      URL.revokeObjectURL(strokeUrl);
    }

    // Save to IndexedDB
    await saveCanvas(blob, newTurnNumber);
    await saveHistory(newTurnNumber, now.getTime(), blob);

    // Update state
    setTurnNumber(newTurnNumber);
    setIsLocked(true);
    setHasDrawing(false);
  }

  // Handle Next Person button
  function handleNextPerson() {
    // Stop timer if running
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    // Clear current stroke
    currentStrokeRef.current = null;
    
    clearActive();
    setTimeLeft(TIME_LIMIT);
    setIsLocked(false);
    setHasDrawing(false);
    setIsTimerRunning(false);
    setTool('brush');
  }

  // Export stroke data as JSON for video creation
  async function exportStrokeData() {
    try {
      const strokes = await getAllStrokes();
      if (strokes.length === 0) {
        alert('No strokes to export.');
        return;
      }
      
      // Create export data with metadata
      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          totalStrokes: strokes.length,
          totalTurns: Math.max(...strokes.map(s => s.turnNumber), 0) + 1,
          canvasSize: 1080,
          description: 'Stroke data for timelapse video creation. Each stroke contains points with timestamps in milliseconds since epoch.',
        },
        strokes: strokes,
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timelapse_strokes_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log(`Exported ${strokes.length} strokes from ${exportData.metadata.totalTurns} turns`);
    } catch (error) {
      console.error('Error exporting strokes:', error);
      alert('Failed to export strokes.');
    }
  }

  // Handle Reset button
  async function handleReset() {
    if (!confirm('Are you sure you want to reset? This will clear all canvas data.')) {
      return;
    }

    await clearAll();
    clearActive();

    // Clear base canvas
    const baseCanvas = baseCanvasRef.current;
    if (baseCanvas) {
      const ctx = baseCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 1080, 1080);
      }
    }

    // Stop timer if running
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Reset state
    setTurnNumber(0);
    setTimeLeft(TIME_LIMIT);
    setIsLocked(false);
    setHasDrawing(false);
    setIsTimerRunning(false);
    setTool('brush');
    setColor('#222222'); // Reset to dark grey/black from palette
  }

  return (
    <div className="app">
      <div className="title-container">
        <h1>Help me make Day 3650 today</h1>
        <p className="instructions">
          You have 10 seconds to add to this canvas. Timer will start as soon as you start brushing.
        </p>
      </div>
      <div className="app-content">
        <Toolbar
          color={color}
          tool={tool}
          brushSize={brushSize}
          brushSizes={BRUSH_SIZES}
          timeLeft={timeLeft}
          isLocked={isLocked}
          hasDrawing={hasDrawing}
          onColorChange={setColor}
          onToolChange={setTool}
          onBrushSizeChange={setBrushSize}
          onDone={handleDone}
          onNextPerson={handleNextPerson}
          onUndo={undo}
        />
        <CanvasStage
          baseCanvasRef={baseCanvasRef}
          activeCanvasRef={activeCanvasRef}
          displayCanvasRef={displayCanvasRef}
          onPointerDown={isLocked || timeLeft <= 0 ? () => {} : handlePointerDown}
          onPointerMove={isLocked || timeLeft <= 0 ? () => {} : handlePointerMove}
          onPointerUp={handlePointerUp}
          disabled={isLocked || timeLeft <= 0}
          brushSize={brushSize}
          brushColor={color}
        />
      </div>
      
      {/* Invisible reset button at bottom left */}
      <button
        className="invisible-reset-button"
        onClick={handleReset}
        title="Reset"
      />
      
      {/* Export all strokes button at bottom right */}
      <button
        className="export-all-strokes-button"
        onClick={exportStrokeData}
        title="Export all strokes as JSON for video creation"
      >
        Export All Strokes
      </button>
    </div>
  );
}

// Add error boundary for debugging
if (import.meta.env.DEV) {
  window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
  });
}

export default App;
