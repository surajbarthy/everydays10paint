#!/usr/bin/env python3
"""
Generate a timelapse video from stroke JSON data.

Usage:
    python generate_timelapse.py input.json output.mp4 [--fps 30] [--speed 1.0]

Requirements:
    pip install pillow opencv-python numpy
"""

import json
import sys
import argparse
from pathlib import Path
from typing import List, Dict, Tuple
from PIL import Image, ImageDraw
import numpy as np
import cv2

CANVAS_SIZE = 1080

def load_strokes(json_path: str) -> Dict:
    """Load stroke data from JSON file."""
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    # Handle both old format (array) and new format (with metadata)
    if isinstance(data, dict) and 'strokes' in data:
        return data['strokes']
    elif isinstance(data, list):
        return data
    else:
        raise ValueError("Invalid JSON format")

def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def draw_stroke_segment(draw: ImageDraw.Draw, start: Tuple[float, float], 
                       end: Tuple[float, float], color: Tuple[int, int, int], 
                       brush_size: int):
    """Draw a line segment between two points."""
    if brush_size <= 0:
        return
    
    # Draw filled rectangle for each point along the line
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    distance = (dx**2 + dy**2)**0.5
    
    if distance > 0:
        steps = max(1, int(distance / (brush_size / 4)))
        for i in range(steps + 1):
            t = i / steps
            x = start[0] + dx * t
            y = start[1] + dy * t
            # Draw square brush
            left = x - brush_size / 2
            top = y - brush_size / 2
            right = x + brush_size / 2
            bottom = y + brush_size / 2
            draw.rectangle([left, top, right, bottom], fill=color)

def create_timelapse_video(strokes: List[Dict], output_path: str, 
                           fps: int = 30, speed: float = 1.0,
                           background_color: str = '#FFFFFF'):
    """Generate timelapse video from stroke data."""
    
    if not strokes:
        print("No strokes to render!")
        return
    
    # Flatten all points with their timestamps and stroke info
    all_points = []
    for stroke in strokes:
        stroke_id = stroke['id']
        color = hex_to_rgb(stroke['color'])
        brush_size = stroke['brushSize']
        
        for i, point in enumerate(stroke['points']):
            all_points.append({
                'stroke_id': stroke_id,
                'point_index': i,
                'x': point['x'],
                'y': point['y'],
                'timestamp': point['timestamp'],
                'color': color,
                'brush_size': brush_size,
                'stroke': stroke,
            })
    
    # Sort by timestamp
    all_points.sort(key=lambda p: p['timestamp'])
    
    if not all_points:
        print("No points to render!")
        return
    
    # Calculate time range
    start_time = all_points[0]['timestamp']
    end_time = all_points[-1]['timestamp']
    duration_ms = end_time - start_time
    duration_seconds = (duration_ms / 1000.0) / speed
    
    print(f"Total duration: {duration_seconds:.2f} seconds")
    print(f"Start time: {start_time}, End time: {end_time}")
    print(f"Total points: {len(all_points)}")
    
    # Calculate frame interval
    frame_interval_ms = 1000.0 / fps / speed
    total_frames = int(duration_seconds * fps)
    
    print(f"Generating {total_frames} frames at {fps} fps...")
    
    # Create video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    video_writer = cv2.VideoWriter(
        output_path, 
        fourcc, 
        fps, 
        (CANVAS_SIZE, CANVAS_SIZE)
    )
    
    # Initialize canvas
    bg_color = hex_to_rgb(background_color)
    canvas = Image.new('RGB', (CANVAS_SIZE, CANVAS_SIZE), bg_color)
    draw = ImageDraw.Draw(canvas)
    
    # Track which strokes have been started
    active_strokes = {}  # stroke_id -> current point index
    completed_strokes = set()
    
    # Process frames
    current_point_index = 0
    all_points_processed = False
    
    for frame_num in range(total_frames):
        # Calculate target time for this frame
        frame_time = start_time + (frame_num * frame_interval_ms)
        
        # Draw all points up to current time
        while current_point_index < len(all_points):
            point_data = all_points[current_point_index]
            
            if point_data['timestamp'] > frame_time:
                break
            
            stroke_id = point_data['stroke_id']
            point_idx = point_data['point_index']
            
            # Start new stroke if needed
            if stroke_id not in active_strokes:
                active_strokes[stroke_id] = 0
                # Redraw all completed strokes
                canvas = Image.new('RGB', (CANVAS_SIZE, CANVAS_SIZE), bg_color)
                draw = ImageDraw.Draw(canvas)
                for completed_id in completed_strokes:
                    stroke = next(s for s in strokes if s['id'] == completed_id)
                    color = hex_to_rgb(stroke['color'])
                    points = stroke['points']
                    brush_size = stroke['brushSize']
                    
                    if len(points) == 1:
                        # Single point stroke (tap) - just draw the point
                        pt = points[0]
                        left = pt['x'] - brush_size / 2
                        top = pt['y'] - brush_size / 2
                        right = pt['x'] + brush_size / 2
                        bottom = pt['y'] + brush_size / 2
                        draw.rectangle([left, top, right, bottom], fill=color)
                    else:
                        # Multi-point stroke - draw first point, then segments
                        # Draw first point
                        first_pt = points[0]
                        left = first_pt['x'] - brush_size / 2
                        top = first_pt['y'] - brush_size / 2
                        right = first_pt['x'] + brush_size / 2
                        bottom = first_pt['y'] + brush_size / 2
                        draw.rectangle([left, top, right, bottom], fill=color)
                        
                        # Draw segments between points
                        for i in range(1, len(points)):
                            start_pt = (points[i-1]['x'], points[i-1]['y'])
                            end_pt = (points[i]['x'], points[i]['y'])
                            draw_stroke_segment(draw, start_pt, end_pt, color, brush_size)
            
            # Draw point
            if point_idx == 0:
                # First point - just draw it
                x = point_data['x']
                y = point_data['y']
                left = x - point_data['brush_size'] / 2
                top = y - point_data['brush_size'] / 2
                right = x + point_data['brush_size'] / 2
                bottom = y + point_data['brush_size'] / 2
                draw.rectangle([left, top, right, bottom], fill=point_data['color'])
            else:
                # Draw line from previous point
                stroke = point_data['stroke']
                prev_point = stroke['points'][point_idx - 1]
                start_pt = (prev_point['x'], prev_point['y'])
                end_pt = (point_data['x'], point_data['y'])
                draw_stroke_segment(draw, start_pt, end_pt, point_data['color'], point_data['brush_size'])
            
            active_strokes[stroke_id] = point_idx
            
            # Check if stroke is complete
            stroke = point_data['stroke']
            if point_idx == len(stroke['points']) - 1:
                completed_strokes.add(stroke_id)
                if stroke_id in active_strokes:
                    del active_strokes[stroke_id]
                # For single-point strokes, ensure they're immediately visible
                if len(stroke['points']) == 1:
                    # Already drawn above, but ensure it stays visible
                    pass
            
            current_point_index += 1
        
        # If all points are processed, ensure all strokes are drawn in remaining frames
        if current_point_index >= len(all_points):
            if not all_points_processed:
                all_points_processed = True
                print(f"All points processed. Redrawing all {len(strokes)} strokes...")
            # Always redraw everything in remaining frames to ensure all strokes are visible
            canvas = Image.new('RGB', (CANVAS_SIZE, CANVAS_SIZE), bg_color)
            draw = ImageDraw.Draw(canvas)
            for stroke in strokes:
                color = hex_to_rgb(stroke['color'])
                points = stroke['points']
                brush_size = stroke['brushSize']
                
                if len(points) == 1:
                    # Single point stroke (tap)
                    pt = points[0]
                    left = pt['x'] - brush_size / 2
                    top = pt['y'] - brush_size / 2
                    right = pt['x'] + brush_size / 2
                    bottom = pt['y'] + brush_size / 2
                    draw.rectangle([left, top, right, bottom], fill=color)
                else:
                    # Multi-point stroke
                    first_pt = points[0]
                    left = first_pt['x'] - brush_size / 2
                    top = first_pt['y'] - brush_size / 2
                    right = first_pt['x'] + brush_size / 2
                    bottom = first_pt['y'] + brush_size / 2
                    draw.rectangle([left, top, right, bottom], fill=color)
                    
                    for i in range(1, len(points)):
                        start_pt = (points[i-1]['x'], points[i-1]['y'])
                        end_pt = (points[i]['x'], points[i]['y'])
                        draw_stroke_segment(draw, start_pt, end_pt, color, brush_size)
        
        # Convert PIL image to OpenCV format and write frame
        frame = cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR)
        video_writer.write(frame)
        
        if (frame_num + 1) % 30 == 0:
            progress = (frame_num + 1) / total_frames * 100
            print(f"Progress: {progress:.1f}% ({frame_num + 1}/{total_frames} frames)")
    
    # Final frame: ensure all strokes are drawn
    canvas = Image.new('RGB', (CANVAS_SIZE, CANVAS_SIZE), bg_color)
    draw = ImageDraw.Draw(canvas)
    for stroke in strokes:
        color = hex_to_rgb(stroke['color'])
        points = stroke['points']
        brush_size = stroke['brushSize']
        
        if len(points) == 1:
            pt = points[0]
            left = pt['x'] - brush_size / 2
            top = pt['y'] - brush_size / 2
            right = pt['x'] + brush_size / 2
            bottom = pt['y'] + brush_size / 2
            draw.rectangle([left, top, right, bottom], fill=color)
        else:
            first_pt = points[0]
            left = first_pt['x'] - brush_size / 2
            top = first_pt['y'] - brush_size / 2
            right = first_pt['x'] + brush_size / 2
            bottom = first_pt['y'] + brush_size / 2
            draw.rectangle([left, top, right, bottom], fill=color)
            
            for i in range(1, len(points)):
                start_pt = (points[i-1]['x'], points[i-1]['y'])
                end_pt = (points[i]['x'], points[i]['y'])
                draw_stroke_segment(draw, start_pt, end_pt, color, brush_size)
    
    # Write final frame multiple times to ensure it's visible
    final_frame = cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR)
    for _ in range(30):  # Hold final frame for 1 second
        video_writer.write(final_frame)
    
    video_writer.release()
    print(f"Video saved to: {output_path}")
    print(f"Total strokes rendered: {len(strokes)}")

def main():
    parser = argparse.ArgumentParser(description='Generate timelapse video from stroke JSON')
    parser.add_argument('input_json', help='Input JSON file with stroke data')
    parser.add_argument('output_video', help='Output video file (e.g., timelapse.mp4)')
    parser.add_argument('--fps', type=int, default=30, help='Frames per second (default: 30)')
    parser.add_argument('--speed', type=float, default=1.0, help='Playback speed multiplier (default: 1.0)')
    parser.add_argument('--bg-color', default='#FFFFFF', help='Background color (default: #FFFFFF)')
    
    args = parser.parse_args()
    
    # Load strokes
    print(f"Loading strokes from {args.input_json}...")
    strokes = load_strokes(args.input_json)
    print(f"Loaded {len(strokes)} strokes")
    
    # Generate video
    create_timelapse_video(
        strokes, 
        args.output_video, 
        fps=args.fps, 
        speed=args.speed,
        background_color=args.bg_color
    )

if __name__ == '__main__':
    main()
