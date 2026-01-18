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

const MAX_DABS = 10;

function App() {
  const [color, setColor] = useState('#000000');
  const [tool, setTool] = useState<Tool>('brush');
  const [dabsLeft, setDabsLeft] = useState(MAX_DABS);
  const [isLocked, setIsLocked] = useState(false);
  const [hasDabs, setHasDabs] = useState(false);
  const [turnNumber, setTurnNumber] = useState(0);
  const canvasInitialized = useRef(false);

  // Handle dab (decrement counter) - defined before hook to avoid issues
  function onDab() {
    if (isLocked || dabsLeft <= 0) return;

    setDabsLeft((prev) => {
      const newValue = prev - 1;
      if (newValue === 0) {
        // Disable drawing when dabs reach 0
        setTool('brush'); // Reset tool
      }
      return newValue;
    });

    setHasDabs(true);
  }

  // Handle undo dab (restore counter)
  function onUndoDab() {
    setDabsLeft((prev) => {
      // Don't exceed MAX_DABS
      return Math.min(prev + 1, MAX_DABS);
    });
  }

  const {
    baseCanvasRef,
    activeCanvasRef,
    displayCanvasRef,
    loadBaseImage,
    clearActive,
    mergeLayers,
    handlePointerDown,
    exportAsBlob,
    undo,
  } = useCanvasLayers({ color, tool, onDab, onUndoDab });

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
    if (isLocked || !hasDabs) return;

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
    setHasDabs(false);
  }

  // Handle Next Person button
  function handleNextPerson() {
    clearActive();
    setDabsLeft(MAX_DABS);
    setIsLocked(false);
    setHasDabs(false);
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

    // Reset state
    setTurnNumber(0);
    setDabsLeft(MAX_DABS);
    setIsLocked(false);
    setHasDabs(false);
    setTool('brush');
    setColor('#000000');
  }

  return (
    <div className="app">
      <h1>Turn-Based Drawing Canvas</h1>
      <div className="app-content">
        <Toolbar
          color={color}
          tool={tool}
          dabsLeft={dabsLeft}
          isLocked={isLocked}
          hasDabs={hasDabs}
          onColorChange={setColor}
          onToolChange={setTool}
          onDone={handleDone}
          onNextPerson={handleNextPerson}
          onReset={handleReset}
          onUndo={undo}
        />
        <CanvasStage
          baseCanvasRef={baseCanvasRef}
          activeCanvasRef={activeCanvasRef}
          displayCanvasRef={displayCanvasRef}
          onPointerDown={isLocked || dabsLeft === 0 ? () => {} : handlePointerDown}
          disabled={isLocked || dabsLeft === 0}
        />
      </div>
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
