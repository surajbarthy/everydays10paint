import { useState, useEffect, useRef } from 'react';
import CanvasStage from './components/CanvasStage';
import Toolbar from './components/Toolbar';
import { useCanvasLayers, type Tool } from './hooks/useCanvasLayers';
import {
  loadCanvas,
  saveCanvas,
  saveHistory,
  clearAll,
} from './utils/db';
import './App.css';

const TIME_LIMIT = 10; // 10 seconds

const BRUSH_SIZES = [10, 50, 100]; // Three brush sizes

function App() {
  const [color, setColor] = useState('#000000');
  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(100);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [isLocked, setIsLocked] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [turnNumber, setTurnNumber] = useState(0);
  const canvasInitialized = useRef(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  const {
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
    undo,
  } = useCanvasLayers({ color, tool, brushSize, onDrawingStart });

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

    // Download the file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

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
    
    clearActive();
    setTimeLeft(TIME_LIMIT);
    setIsLocked(false);
    setHasDrawing(false);
    setIsTimerRunning(false);
    setTool('brush');
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
    setColor('#000000');
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
      
      {/* Invisible reset button at bottom right */}
      <button
        className="invisible-reset-button"
        onClick={handleReset}
        title="Reset"
      />
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
