# Georgia Tech Student Center: Activity & Analytics Dashboard

A high-fidelity 3D visualization and decision-support tool for student activity at the Georgia Tech Student Center. This project leverages real-world observational data to help students find their ideal study environment through spatial mapping, personalized recommendations, and floor-level analytics.

## Key Features

### 1. Interactive 3D Mapping (Explore Mode)
*   **Topological Heatmaps**: Architectural "spikes" represent real-time student density (crowdedness) across 26 different areas.
*   **Bivariate Visualization**: A custom color scale simultaneously maps **Noise Levels (Gold)** and **Crowdedness (Blue)**, allowing users to identify "Quiet but Busy" or "Loud but Empty" spots at a glance.
*   **Dynamic Tooltips**: Hover over any area to see live student counts, decibel levels, and activity breakdowns (Studying, Talking, Eating, and Digital usage).

### 2. Area Selector (Recommendation Engine)
*   **Personalized Search**: Input your desired time of day, noise preference (Quiet, Moderate, Loud), and crowdedness (Empty, Moderate, Crowded).
*   **Scoring Algorithm**: A data-driven engine ranks every area in the building and returns the **Top 3 Best Matches** for your specific needs.
*   **Instant Navigation**: Clicking a recommendation automatically centers the 3D map, highlights the room, and synchronizes the global time slider.

### 3. Floor Snapshot (Analytics Tab)
*   **Building-Wide Trends**: Comparative horizontal bar charts (powered by **D3.js**) showing average noise and density across all three floors simultaneously.
*   **Activity Distribution**: Aggregated breakdowns of student behavior per floor, helping identify which floors are best for social activities versus focused study.

---

## Quick Start

### Prerequisites
Since the project fetches local data files (CSV/JSON), it must be served via a web server to avoid CORS issues.

### Run Locally (Node.js)
```bash
npx serve .
```

### Run Locally (Python)
```bash
python3 -m http.server
```
Once started, open `http://localhost:3000` in your browser.

---

## File Structure

### Application Core
- **index.html**: Hierarchical dashboard layout with consolidated navigation (Modes, Floors, and Time).
- **main.js**: The central engine handling Three.js WebGL rendering, D3 data aggregation, recommendation scoring, and UI synchronization.
- **style.css**: Modern Georgia Tech-inspired theme (Navy/Gold) with a compact, single-screen responsive design.

### Data & Assets
- **Map Data Collection - Sheet1.csv**: Final source of truth for student activity observations.
- **room.json**: Geometric coordinates and metadata for 3D room positioning.
- **data/images/**: Real-world photos of every study area synchronized with the 3D tooltips.
- **public/**: Textures and base floor plan images used for the 3D surface mapping.

---

## Technical Stack
- **[Three.js](https://threejs.org/)**: 3D Graphics and topological displacement mapping.
- **[D3.js](https://d3js.org/)**: Data parsing, color interpolation, and analytics charting.
- **[Google Fonts (Inter)](https://fonts.google.com/specimen/Inter)**: Premium modern typography.
- **[SheetJS (Integration Ready)](https://sheetjs.com/)**: Capabilities for handling complex Excel exports.

---

## Controls
- **Left Click + Drag**: Orbit/Rotate the 3D view.
- **Right Click + Drag**: Pan the camera.
- **Scroll**: Zoom in/out.
- **Mode Toggles**: Switch between Explore (Map), Area Selector (Search), and Floor Snapshot (Charts).
- **Time Slider**: View data across 5 distinct time slots (12:00 PM to 8:00 PM).
