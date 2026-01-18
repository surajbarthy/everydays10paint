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
    
    # Group strokes by turn and compress timeline (remove gaps between turns)
    turns = {}
    for stroke in strokes:
        turn_num = stroke['turnNumber']
        if turn_num not in turns:
            turns[turn_num] = []
        turns[turn_num].append(stroke)
    
    # Sort turns
    sorted_turn_numbers = sorted(turns.keys())
    
    # Compress timeline: normalize timestamps within each turn, then sequence turns
    all_points = []
    cumulative_time = 0
    
    for turn_num in sorted_turn_numbers:
        turn_strokes = turns[turn_num]
        # Sort strokes in this turn by timestamp
        turn_strokes.sort(key=lambda s: s['timestamp'])
        
        # Find the first timestamp in this turn
        turn_start_time = min(
            min(p['timestamp'] for p in s['points']) 
            for s in turn_strokes
        )
        
        # Add all points from this turn with compressed timestamps
        for stroke in turn_strokes:
            stroke_id = stroke['id']
            color = hex_to_rgb(stroke['color'])
            brush_size = stroke['brushSize']
            undone = stroke.get('undone', False)
            undone_at = stroke.get('undoneAt')
            
            # Calculate compressed timestamp for when undo was pressed (if applicable)
            compressed_undone_at = None
            if undone and undone_at:
                # Find the point in this stroke that's closest to undone_at
                # and calculate its compressed timestamp
                for point in stroke['points']:
                    if point['timestamp'] >= undone_at:
                        relative_undone_time = point['timestamp'] - turn_start_time
                        compressed_undone_at = cumulative_time + relative_undone_time
                        break
                # If no point found, use the last point's timestamp
                if compressed_undone_at is None and stroke['points']:
                    last_point = stroke['points'][-1]
                    relative_undone_time = last_point['timestamp'] - turn_start_time
                    compressed_undone_at = cumulative_time + relative_undone_time
            
            for i, point in enumerate(stroke['points']):
                # Normalize timestamp relative to turn start, then add to cumulative time
                relative_time = point['timestamp'] - turn_start_time
                compressed_timestamp = cumulative_time + relative_time
                
                # Skip points after undo timestamp
                if undone and compressed_undone_at and compressed_timestamp > compressed_undone_at:
                    continue
                
                all_points.append({
                    'stroke_id': stroke_id,
                    'point_index': i,
                    'x': point['x'],
                    'y': point['y'],
                    'timestamp': compressed_timestamp,
                    'color': color,
                    'brush_size': brush_size,
                    'stroke': stroke,
                })
        
        # Update cumulative time: add the duration of this turn
        turn_end_time = max(
            max(p['timestamp'] for p in s['points']) 
            for s in turn_strokes
        )
        turn_duration = turn_end_time - turn_start_time
        cumulative_time += turn_duration
    
    # Sort by compressed timestamp
    all_points.sort(key=lambda p: p['timestamp'])
    
    if not all_points:
        print("No points to render!")
        return
    
    # Calculate time range (now compressed, no gaps)
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
                # Redraw all completed strokes in chronological order
                canvas = Image.new('RGB', (CANVAS_SIZE, CANVAS_SIZE), bg_color)
                draw = ImageDraw.Draw(canvas)
                # Get completed strokes and sort by timestamp to maintain proper layering
                completed_stroke_list = [s for s in strokes if s['id'] in completed_strokes]
                completed_stroke_list.sort(key=lambda s: s['timestamp'])
                
                for stroke in completed_stroke_list:
                    # Handle undone strokes - only draw up to undo point
                    if stroke.get('undone', False):
                        undone_at = stroke.get('undoneAt')
                        if undone_at:
                            points_to_draw = [p for p in stroke['points'] if p['timestamp'] < undone_at]
                        else:
                            points_to_draw = []
                    else:
                        points_to_draw = stroke['points']
                    
                    if not points_to_draw:
                        continue
                    
                    color = hex_to_rgb(stroke['color'])
                    brush_size = stroke['brushSize']
                    
                    if len(points_to_draw) == 1:
                        # Single point stroke (tap) - just draw the point
                        pt = points_to_draw[0]
                        left = pt['x'] - brush_size / 2
                        top = pt['y'] - brush_size / 2
                        right = pt['x'] + brush_size / 2
                        bottom = pt['y'] + brush_size / 2
                        draw.rectangle([left, top, right, bottom], fill=color)
                    else:
                        # Multi-point stroke - draw first point, then segments
                        # Draw first point
                        first_pt = points_to_draw[0]
                        left = first_pt['x'] - brush_size / 2
                        top = first_pt['y'] - brush_size / 2
                        right = first_pt['x'] + brush_size / 2
                        bottom = first_pt['y'] + brush_size / 2
                        draw.rectangle([left, top, right, bottom], fill=color)
                        
                        # Draw segments between points
                        for i in range(1, len(points_to_draw)):
                            start_pt = (points_to_draw[i-1]['x'], points_to_draw[i-1]['y'])
                            end_pt = (points_to_draw[i]['x'], points_to_draw[i]['y'])
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
            # Always redraw everything in remaining frames to ensure all strokes are visible (excluding undone parts)
            canvas = Image.new('RGB', (CANVAS_SIZE, CANVAS_SIZE), bg_color)
            draw = ImageDraw.Draw(canvas)
            # Sort strokes by timestamp to maintain proper layering
            sorted_strokes = sorted(strokes, key=lambda s: s['timestamp'])
            for stroke in sorted_strokes:
                # Handle undone strokes - only draw up to undo point
                if stroke.get('undone', False):
                    undone_at = stroke.get('undoneAt')
                    if undone_at:
                        points_to_draw = [p for p in stroke['points'] if p['timestamp'] < undone_at]
                    else:
                        points_to_draw = []
                else:
                    points_to_draw = stroke['points']
                
                if not points_to_draw:
                    continue
                
                color = hex_to_rgb(stroke['color'])
                brush_size = stroke['brushSize']
                
                if len(points_to_draw) == 1:
                    # Single point stroke (tap)
                    pt = points_to_draw[0]
                    left = pt['x'] - brush_size / 2
                    top = pt['y'] - brush_size / 2
                    right = pt['x'] + brush_size / 2
                    bottom = pt['y'] + brush_size / 2
                    draw.rectangle([left, top, right, bottom], fill=color)
                else:
                    # Multi-point stroke
                    first_pt = points_to_draw[0]
                    left = first_pt['x'] - brush_size / 2
                    top = first_pt['y'] - brush_size / 2
                    right = first_pt['x'] + brush_size / 2
                    bottom = first_pt['y'] + brush_size / 2
                    draw.rectangle([left, top, right, bottom], fill=color)
                    
                    for i in range(1, len(points_to_draw)):
                        start_pt = (points_to_draw[i-1]['x'], points_to_draw[i-1]['y'])
                        end_pt = (points_to_draw[i]['x'], points_to_draw[i]['y'])
                        draw_stroke_segment(draw, start_pt, end_pt, color, brush_size)
        
        # Convert PIL image to OpenCV format and write frame
        frame = cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR)
        video_writer.write(frame)
        
        if (frame_num + 1) % 30 == 0:
            progress = (frame_num + 1) / total_frames * 100
            print(f"Progress: {progress:.1f}% ({frame_num + 1}/{total_frames} frames)")
    
    # Final frame: ensure all strokes are drawn in chronological order (excluding undone parts)
    canvas = Image.new('RGB', (CANVAS_SIZE, CANVAS_SIZE), bg_color)
    draw = ImageDraw.Draw(canvas)
    # Sort strokes by timestamp to maintain proper layering
    sorted_strokes = sorted(strokes, key=lambda s: s['timestamp'])
    for stroke in sorted_strokes:
        # Skip undone strokes entirely, or only draw up to undo point
        if stroke.get('undone', False):
            undone_at = stroke.get('undoneAt')
            if undone_at:
                # Only draw points before undo timestamp
                points_to_draw = [p for p in stroke['points'] if p['timestamp'] < undone_at]
            else:
                # If no undo timestamp, skip the stroke entirely
                continue
        else:
            points_to_draw = stroke['points']
        
        if not points_to_draw:
            continue
            
        color = hex_to_rgb(stroke['color'])
        brush_size = stroke['brushSize']
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
