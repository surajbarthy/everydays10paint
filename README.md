# Turn-Based Drawing Canvas

A collaborative turn-based drawing canvas web application built with Vite, React, and TypeScript.

## Features

- **1080x1080 pixel canvas** with device pixel ratio handling for crisp rendering
- **Two-layer system**: BASE (permanent) and ACTIVE (current turn) layers
- **Color palette**: 12 predefined colors
- **Brush tool**: 10px circular brush
- **Eraser tool**: 10px eraser using destination-out compositing
- **Turn-based drawing**: Each person gets 100 dabs per turn
- **Local persistence**: Uses IndexedDB to save canvas state and history
- **Export functionality**: Downloads PNG files on turn completion
- **Responsive design**: Works on desktop and mobile devices

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to the URL shown in the terminal (typically `http://localhost:5173`)

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## How to Use

1. **Select a color** from the palette
2. **Choose a tool** (Brush or Eraser)
3. **Click/tap** on the canvas to place dabs (each click counts as one dab)
4. **Monitor your dabs** - you have 100 dabs per turn
5. **Press "Done"** when finished (requires at least 1 dab)
6. **Download** - The canvas is automatically exported as a PNG file
7. **Hand to next person** - Press "Next Person" to start a new turn
8. **Reset** - Use the Reset button (with confirmation) to clear all data

## Technical Details

- **Canvas Size**: Internal resolution is always 1080x1080 pixels
- **Device Pixel Ratio**: Automatically scales for high-DPI displays
- **Storage**: Uses IndexedDB with the `idb` library
- **Export Format**: PNG files named `canvas_turn_###_YYYY-MM-DD_HH-mm-ss.png`
- **Layers**: BASE layer is permanent, ACTIVE layer is cleared after each turn

## Project Structure

```
src/
├── components/
│   ├── CanvasStage.tsx    # Canvas rendering component
│   └── Toolbar.tsx        # UI controls and tools
├── hooks/
│   └── useCanvasLayers.ts # Canvas drawing logic hook
├── utils/
│   └── db.ts             # IndexedDB storage utilities
├── App.tsx               # Main app component
├── App.css               # Styles
├── main.tsx              # Entry point
└── index.css             # Global styles
```

## Browser Support

- Modern browsers with IndexedDB support
- Chrome, Firefox, Safari, Edge (latest versions)
- Mobile browsers (iOS Safari, Chrome Mobile)
