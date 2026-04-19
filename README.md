# CS8803 Map Project: Student Activity Visualization

A high-fidelity 3D visualization of student activity at the Georgia Tech Student Center. This project uses topological surfaces to represent student crowdedness and choropleth mapping to visualize noise levels across different floors and times of day.

## Quick Start

Since the project fetches local data files, it must be served via a web server to avoid CORS issues.

### Using Node.js (Recommended)
```bash
npx serve .
```

### Using Python
```bash
python3 -m http.server
```

Once started, open the provided URL (e.g., `http://localhost:3000`) in your browser.

---

## File Structure

### Core Logic & UI
- **index.html**: The entry point of the application. Defines the UI structure, including floor tabs, the time slider, and the interaction legends.
- **main.js**: The core engine. Handles Three.js 3D rendering, D3.js data parsing, topological surface displacement (spikes), and interactive tooltips.
- **style.css**: Contains all layout and design styling, featuring a modern Georgia Tech-inspired theme (Navy and Gold).

### Data Files
- **room.json**: Definition of room geometries, including coordinates, IDs, and labels for each floor.
- **map_data.csv**: Time-series observational data including student counts, noise levels (dBA), and activity types.
- **data.json**: Pre-processed JSON version of the activity data.

### Assets
- **public/**: Contains floor plan images (`floor1.png`, `floor2.png`, `floor3.png`) used as base textures for the 3D map.
- **sc_background.webp**: High-resolution background image for the application UI.

---

## Controls & Interaction

- **Left Click + Drag**: Orbit/Rotate the 3D view.
- **Right Click + Drag**: Pan/Translate the camera.
- **Scroll**: Zoom in and out.
- **Hover**: Hover over a room or area peak to see detailed metrics (students, noise level, activities).
- **Time Slider**: Adjust the time of day to see how crowdedness and noise levels evolve.
- **Floor Tabs**: Switch between the different levels of the Student Center.

---

## Technologies Used

- **[Three.js](https://threejs.org/)**: 3D Graphics and WebGL rendering.
- **[D3.js](https://d3js.org/)**: Data-driven document manipulation and color interpolation.
- **[Inter Font](https://rsms.me/inter/)**: Clean, modern typography.

---

## Deployment

Since this is a static site, it can be hosted for free on **GitHub Pages**:

1. **Commit and Push**: Ensure all files (including `index.html`, `main.js`, `style.css`, and the `public/` folder) are pushed to your GitHub repository.
2. **Enable Hosting**:
    - Go to your repository on GitHub.
    - Navigate to **Settings > Pages**.
    - Set the **Branch** to `main` and the folder to `/(root)`.
    - Click **Save**.
3. **Important Note**: Ensure your filenames are case-sensitive (e.g., `public/floor1.png` must match exactly in the code) as GitHub Pages is a case-sensitive environment.
