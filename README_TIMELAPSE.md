# Timelapse Video Generation

This script generates a video timelapse from the exported stroke JSON data.

## Installation

1. Install Python 3.7 or higher
2. Install required packages:

```bash
pip install -r requirements.txt
```

Or install individually:
```bash
pip install pillow opencv-python numpy
```

## Usage

### Basic Usage

```bash
python generate_timelapse.py input.json output.mp4
```

### With Options

```bash
# 60 FPS video
python generate_timelapse.py strokes.json timelapse.mp4 --fps 60

# 2x speed playback
python generate_timelapse.py strokes.json timelapse.mp4 --speed 2.0

# Custom background color
python generate_timelapse.py strokes.json timelapse.mp4 --bg-color "#000000"

# Combine options
python generate_timelapse.py strokes.json timelapse.mp4 --fps 30 --speed 1.5 --bg-color "#FFFFFF"
```

## Parameters

- `input_json`: Path to the exported JSON file from the canvas app
- `output_video`: Output video file path (e.g., `timelapse.mp4`)
- `--fps`: Frames per second (default: 30)
- `--speed`: Playback speed multiplier (1.0 = real-time, 2.0 = 2x faster, 0.5 = 2x slower)
- `--bg-color`: Background color in hex format (default: "#FFFFFF" for white)

## Examples

```bash
# Standard timelapse
python generate_timelapse.py strokes_2026-01-18T07-56-40.json timelapse.mp4

# Fast 60fps timelapse
python generate_timelapse.py strokes.json fast_timelapse.mp4 --fps 60 --speed 2.0

# Slow motion with black background
python generate_timelapse.py strokes.json slow_motion.mp4 --speed 0.5 --bg-color "#000000"
```

## How It Works

1. Loads all strokes from the JSON file
2. Flattens all points and sorts them by timestamp
3. Renders frames at regular intervals (based on FPS)
4. Draws strokes progressively as their timestamps are reached
5. Combines all frames into an MP4 video

The script maintains stroke continuity - when a new stroke starts, it redraws all completed strokes to ensure proper layering.

## Troubleshooting

- **"No module named 'cv2'"**: Install opencv-python: `pip install opencv-python`
- **"No module named 'PIL'"**: Install pillow: `pip install pillow`
- **Video is too fast/slow**: Adjust the `--speed` parameter
- **Video quality**: Higher FPS gives smoother playback but larger file size
