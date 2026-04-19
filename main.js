// Label Engine: Generates procedural high-resolution text sprites for the 3D map
function createLabelSprite(text, fontSize = 24, color = "#003057", isBold = true) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const font = `${isBold ? 'bold' : 'normal'} ${fontSize}px 'Inter', sans-serif`;
    
    context.font = font;
    const padding = 10;
    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    
    // Resize canvas to fit the exact text dimensions
    canvas.width = textWidth + padding * 2;
    canvas.height = fontSize + padding * 2;
    
    // Clear and redraw for maximum sharpness
    context.font = font;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Subtle white stroke for high contrast against dark gold/navy
    context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    context.lineWidth = 4;
    context.strokeText(text, canvas.width / 2, canvas.height / 2);
    
    context.fillStyle = color;
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: false // Ensure labels are always strictly visible on top
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    
    // Scale sprite relative to its text aspect ratio
    const scaleFactor = canvas.width / canvas.height;
    sprite.scale.set(scaleFactor * fontSize * 1.5, fontSize * 1.5, 1);
    
    return sprite;
}

// Setup Architectural Tooltip
const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background", "rgba(255, 255, 255, 0.95)")
    .style("padding", "16px")
    .style("border", "1px solid #003057") /* GT Navy */
    .style("border-top", "4px solid #B3A369") /* GT Gold */
    .style("box-shadow", "0 6px 20px rgba(0,0,0,0.1)")
    .style("pointer-events", "none")
    .style("font-family", "'Inter', sans-serif")
    .style("font-size", "13px")
    .style("color", "#003057")
    .style("z-index", 50)
    .style("transform", "translate(-50%, -110%)")
    .style("transition", "opacity 0.2s ease, transform 0.1s ease");

// Global State
let currentRoomData = [];
let currentMapData = [];
let currentTime = "4/7/2026 12:00";
let currentSliderValue = 12;
let currentFloor = 1;

// Three.js Renderers Context
const floorScenes = {}; 

function initFloorMap(containerId, floorNum, roomData) {
    const container = document.querySelector(containerId);
    
    // Clear any previous setup entirely
    container.innerHTML = "";

    const width = container.clientWidth - 20; // accounting for 10px padding
    const height = container.clientHeight - 20;

    // SCENE
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f8f9fa');

    // CAMERA
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    // Bring camera strictly closer to make the map large and focused
    camera.position.set(0, -1100, 1100);
    camera.up.set(0, 0, 1);

    // RENDERER
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // CONTROLS
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.2; 
    // Enable slow, showcase-level auto rotation that pauses on user interact
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    
    // Shut off rotation permanently the moment the user interacts with the canvas
    controls.addEventListener('start', () => {
        controls.autoRotate = false;
    });

    // Shift the aim so it centers up the architecture block tightly
    controls.target.set(0, 0, 250);

    // LIGHTING
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(200, -200, 1000);
    scene.add(dirLight);

    // TEXTURE & MATERIAL
    const textureLoader = new THREE.TextureLoader();
    const mapTex = textureLoader.load(`public/floor${floorNum}.png`);
    
    // FLAT FLOOR MAP
    const flatFloorGeo = new THREE.PlaneGeometry(1000, 1000);
    const planeMat = new THREE.MeshBasicMaterial({
        map: mapTex,
        side: THREE.DoubleSide
    });
    const flatFloorMesh = new THREE.Mesh(flatFloorGeo, planeMat);
    scene.add(flatFloorMesh);

    // 3D NOISE TOPOLOGY SURFACE (HOVERING OVER FLOOR)
    const planeGeo = new THREE.PlaneGeometry(1000, 1000, 150, 150);
    
    // Initialize vertex colors array
    const colors = [];
    for ( let i = 0; i < planeGeo.attributes.position.count; i ++ ) {
        colors.push( 0, 0, 1 ); // Default to blue Base
    }
    planeGeo.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );

    const noiseMat = new THREE.MeshPhongMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        side: THREE.FrontSide,
        shininess: 90,
        wireframe: true
    });
    
    const surfaceMesh = new THREE.Mesh(planeGeo, noiseMat);
    // Hover gracefully just above the floor mapping
    surfaceMesh.position.z = 120; 
    scene.add(surfaceMesh);

    // INTERACTIVITY TILES (Bivariate Base)
    const floorRooms = roomData.filter(d => d.floor === floorNum);
    const interactableMeshes = [];
    
    floorRooms.forEach(d => {
        // Flat tile on the floor, rather than massive invisible hitbox
        const boxGeo = new THREE.BoxGeometry(d.w, d.h, 5);
        const boxMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            transparent: true,
            opacity: 0.0, 
            visible: false 
        });
        const boxMesh = new THREE.Mesh(boxGeo, boxMat);
        
        // Z=2 rests tightly on the floor plan
        const posX = (d.x + d.w/2) - 500;
        const posY = 500 - (d.y + d.h/2);
        boxMesh.position.set( posX, posY, 2 );
        boxMesh.userData = d; 
        
        // --- ARCHITECTURAL LABELS ---
        
        // Dynamic Floating Name Label (to be animated above peaks)
        const nameLabel = createLabelSprite(d.name, 18, "#003057", false);
        nameLabel.position.set(0, 0, 150); // Initial hover height
        boxMesh.add(nameLabel);
        boxMesh.userData.nameLabel = nameLabel; 

        // Add structural faint boundary lines
        const edges = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1 });
        const lineMesh = new THREE.LineSegments(edges, lineMat);
        boxMesh.add(lineMesh);
        boxMesh.userData.lineMesh = lineMesh;
        boxMesh.userData.baseOpacity = 0.85;
        
        scene.add(boxMesh);
        interactableMeshes.push(boxMesh);
    });

    // RAYCASTING
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-1000, -1000);

    const onMouseMove = (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        // Dynamically compute width/height instead of relying on stale initialization variables
        const bWidth = rect.width;
        const bHeight = rect.height;
        
        mouse.x = ((event.clientX - rect.left) / bWidth) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / bHeight) * 2 + 1;
        
        mouse.pageX = event.pageX;
        mouse.pageY = event.pageY;
    };
    renderer.domElement.addEventListener('mousemove', onMouseMove, false);

    const onMouseLeave = () => {
        mouse.x = -1000;
        mouse.y = -1000;
        tooltip.transition().duration(400).style("opacity", 0);
    };
    renderer.domElement.addEventListener('mouseleave', onMouseLeave, false);

    floorScenes[floorNum] = {
        container, renderer, scene, camera, controls, planeGeo, 
        surfaceMesh, raycaster, mouse, interactableMeshes, floorRooms, 
        hoveredBox: null, floorNum: floorNum // Store floorNum for strict gating
    };

    updateFloorDisplacement(floorNum);
}

function animate() {
    requestAnimationFrame(animate);

    Object.values(floorScenes).forEach(ctx => {
        // Strict gating: Only process raycasting and control updates for the physically visible floor.
        // This solves the bug where tooltips from hidden floors (like Floor 3) were being hit while on Floor 2.
        if (ctx.floorNum === currentFloor) {
            ctx.controls.update();

            ctx.raycaster.setFromCamera(ctx.mouse, ctx.camera);
            // Explicitly set recursive to false so we don't raycast against the border lines!
            const intersects = ctx.raycaster.intersectObjects(ctx.interactableMeshes, false);
            
            if (intersects.length > 0) {
                const hovered = intersects[0].object;
                const d = hovered.userData;
                
                if (ctx.hoveredBox !== hovered) {
                    // Reset old box visuals
                    if (ctx.hoveredBox) {
                        ctx.hoveredBox.material.opacity = ctx.hoveredBox.userData.baseOpacity;
                        ctx.hoveredBox.userData.lineMesh.material.color.setHex(0x000000);
                        ctx.hoveredBox.userData.lineMesh.material.opacity = 0.1;
                    }
                    
                    // Light up newly hovered box borders so the user clearly sees the boundary constraint!
                    ctx.hoveredBox = hovered;
                    ctx.hoveredBox.material.opacity = 1.0; 
                    ctx.hoveredBox.userData.lineMesh.material.color.setHex(0xB3A369); // GT Gold Edge
                    ctx.hoveredBox.userData.lineMesh.material.opacity = 1.0;
                    
                    tooltip.transition().duration(100).style("opacity", 1);
                }
                
                let tooltipContent = `<strong style="color: #003057; font-size: 15px; text-transform: uppercase;">${d.name}</strong><br/>
                    <span style="color: #666666; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Area ${d.id} | Floor ${d.floor}</span><br/>
                    <hr style="border:none; border-top:1px solid #e0e0e0; margin: 8px 0;">`;
                if (d.csvData) {
                    tooltipContent += `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; margin-bottom: 8px;">
                        <span style="color: #333333"><b>Students:</b> <strong style="color: #003057">${d.csvData['Total num students']}</strong></span>
                        <span style="color: #333333"><b>Noise:</b> <strong style="color: #B3A369">${d.csvData['Decibel level (dBA)']} dBA</strong></span>
                    </div>
                    <div style="font-size: 11px; color: #555555; border-top: 1px dashed #e0e0e0; padding-top: 6px;">
                        ${d.csvData['Num studying']} studying &middot; ${d.csvData['Num eating']} eating &middot; ${d.csvData['Num talking']} talking
                    </div>`;
                }

                tooltip.html(tooltipContent)
                    .style("left", ctx.mouse.pageX + "px")
                    .style("top", ctx.mouse.pageY + "px");

            } else {
                if (ctx.hoveredBox !== null) {
                    ctx.hoveredBox.material.opacity = ctx.hoveredBox.userData.baseOpacity;
                    ctx.hoveredBox.userData.lineMesh.material.color.setHex(0x000000);
                    ctx.hoveredBox.userData.lineMesh.material.opacity = 0.1;
                    ctx.hoveredBox = null;
                    tooltip.transition().duration(400).style("opacity", 0);
                }
            }

            ctx.renderer.render(ctx.scene, ctx.camera);
        }
    });
}
animate();

function updateFloorDisplacement(floorNum, timeT = 0) {
    const ctx = floorScenes[floorNum];
    if (!ctx) return;

    const positions = ctx.planeGeo.attributes.position;
    const colors = ctx.planeGeo.attributes.color;
    const verticesCount = positions.count;

    for(let i=0; i < verticesCount; i++) {
        const vx = positions.getX(i);
        const vy = positions.getY(i);
        positions.setZ(i, 0);
    }
    
    const tempColor = new THREE.Color();

    for(let i=0; i < verticesCount; i++) {
        const vx = positions.getX(i);
        const vy = positions.getY(i);
        let finalZ = 0;

        ctx.floorRooms.forEach(room => {
            if (!room.csvData) return;
            // Switching the core driver to Total Students to provide perfectly symmetrical height mapping
            const students = +room.csvData['Total num students'];
            if (isNaN(students) || students < 1) return; 

            const threeX = (room.x + room.w/2) - 500;
            const threeY = 500 - (room.y + room.h/2);

            const dx = vx - threeX;
            const dy = vy - threeY;
            const distSq = dx*dx + dy*dy;
            
            // Tight spread to maintain clear "spikes"
            const spread = (Math.max(room.w, room.h) * 0.45) ** 2;
            
            // Linear scaling to ensure height visually reflects exact proportional differences
            const MAX_STUDENTS = 65; 
            const heightAmplifier = (students / MAX_STUDENTS) * 700;
            
            const zContribution = heightAmplifier * Math.exp(-distSq / spread);
            finalZ += zContribution;
        });

        // Cap height at a high limit
        const clampedZ = Math.min(finalZ, 800);
        positions.setZ(i, clampedZ);
        
        // Fetch perfectly interpolated D3 time/intensity scale color
        const heightPercent = Math.min(clampedZ / 500, 1.0); 
        const mappedColor = getSurfaceColor(heightPercent, timeT);
        tempColor.set(mappedColor);
        colors.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
    }
    
    ctx.planeGeo.attributes.position.needsUpdate = true;
    ctx.planeGeo.attributes.color.needsUpdate = true;
    ctx.planeGeo.computeVertexNormals();

    // --- DYNAMIC LABEL HEIGHT SYNCING ---
    // Reposition room names to float precisely above their topological peaks
    ctx.interactableMeshes.forEach(mesh => {
        const room = mesh.userData;
        if (!room.nameLabel) return;

        const centerX = (room.x + room.w/2) - 500;
        const centerY = 500 - (room.y + room.h/2);
        let peakZ = 0;

        // Calculate the combined Z contribution from all current peaks at this specific room's location
        ctx.floorRooms.forEach(peakRoom => {
            if (!peakRoom.csvData) return;
            const students = +peakRoom.csvData['Total num students'];
            if (isNaN(students) || students < 1) return;

            const px = (peakRoom.x + peakRoom.w/2) - 500;
            const py = 500 - (peakRoom.y + peakRoom.h/2);

            const dx = centerX - px;
            const dy = centerY - py;
            const distSq = dx*dx + dy*dy;
            const spread = (Math.max(peakRoom.w, peakRoom.h) * 0.45) ** 2;
            const heightAmplifier = (students / 65) * 700;
            
            peakZ += heightAmplifier * Math.exp(-distSq / spread);
        });

        // Anchor the label 40 units above the 3D surface grid (which itself is at Z=120)
        // We add the surfaceMesh.position.z (120) to keep it in sync with the visual topological layer.
        mesh.userData.nameLabel.position.z = Math.min(peakZ, 800) + 40 + 120;
    });
}

function updateAllMaps() {
    const t = (currentSliderValue - 12) / 8.0; // 0.0 to 1.0 (12pm to 8pm)
    
    // Update legend bar dynamically
    const legendGoldEnd = d3.interpolateRgb("#B3A369", "#003057")(t);
    const legendMid = d3.interpolateRgb("#FFCC00", "#b1c3d6")(t);
    document.getElementById('dynamic-legend-bar').style.background = `linear-gradient(to right, #f8fafc, ${legendMid}, ${legendGoldEnd})`;
    // Update thumb color dynamically
    document.documentElement.style.setProperty('--slider-thumb-color', legendGoldEnd);

    [1, 2, 3].forEach(floorNum => {
        const ctx = floorScenes[floorNum];
        if (!ctx) return;
        
        // Dynamically scale surface opacity based on time to keep evening views light and legible
        // Day (Gold) = 0.9 opacity | Night (Navy) = 0.5 opacity
        ctx.surfaceMesh.material.opacity = d3.interpolateNumber(0.9, 0.5)(t);
        
        const timeData = currentMapData.filter(d => d['Date Time'] === currentTime);
        
        ctx.floorRooms.forEach(room => {
            room.csvData = timeData.find(d => +d.ID === room.id);
        });

        // Loop through floor tiles to paint Univariate Dynamics
        ctx.interactableMeshes.forEach(mesh => {
            const rm = mesh.userData;
            if (rm.csvData) {
                const noise = +rm.csvData['Decibel level (dBA)'];
                // Drastic Intensification: Scaling noise between 45 and 72 dBA to ensure 
                // meaningful color changes even in the middle of the standard decibel range.
                const intensity = Math.max(0, Math.min(1, (noise - 45) / 27));
                mesh.material.color.set(getChoroplethColor(intensity, t));
                mesh.userData.baseOpacity = 0.85;
                mesh.material.opacity = mesh.userData.baseOpacity; 
                mesh.material.visible = true;
                mesh.material.depthTest = false; 
                // Set blending mode to Multiply, ensuring the black numbers + lines on the floor images strike through the colors boldly!
                mesh.material.blending = THREE.MultiplyBlending;
            } else {
                mesh.material.visible = false;
            }
        });

        // Trigger rebuild passing down slider interpolation constant
        updateFloorDisplacement(floorNum, t);
    });
}

d3.select("#btn-12pm").on("click", function() {
    d3.selectAll(".time-toggle button").classed("active", false);
    d3.select(this).classed("active", true);
    currentTime = "4/7/2026 12:00";
    updateAllMaps();
});

d3.select("#btn-8pm").on("click", function() {
    d3.selectAll(".time-toggle button").classed("active", false);
    d3.select(this).classed("active", true);
    currentTime = "4/7/2026 20:00";
    updateAllMaps();
});

function formatSliderTime(value) {
    const hrFloat = parseFloat(value);
    const hr = Math.round(hrFloat);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const displayHr = hr > 12 ? hr - 12 : (hr === 0 ? 12 : hr);
    return `${displayHr}:00 ${ampm}`;
}

function onSliderChange(val) {
    currentSliderValue = parseInt(val);
    document.getElementById('slider-time-label').innerText = formatSliderTime(currentSliderValue);
    
    currentTime = `4/7/2026 ${currentSliderValue}:00`;
    updateAllMaps();
}

function getSurfaceColor(intensityNormal, timeT) {
    // UNIFORM COLOR MODE: Surface color is based only on global time blending.
    const goldBase = "#D4C491"; 
    const navyBase = "#A3BFD9"; // Lightened for better transparency feel
    return d3.interpolateRgb(goldBase, navyBase)(timeT);
}

function getChoroplethColor(intensity, timeT) {
    // DRASTIC HUE MODE: The floor tiles use a high-contrast scale to show noise levels.
    const goldScale = d3.scaleLinear().domain([0, 0.5, 1.0]).range(["#ffffff", "#FFCC00", "#997A00"]);
    const navyScale = d3.scaleLinear().domain([0, 0.5, 1.0]).range(["#ffffff", "#b1c3d6", "#001A33"]);
    return d3.interpolateRgb(goldScale(intensity), navyScale(intensity))(timeT);
}

Promise.all([
    d3.json('room.json'),
    d3.csv('map_data.csv')
]).then(([roomData, mapData]) => {
    currentRoomData = roomData;
    currentMapData = mapData;

    const filteredData = currentMapData.filter(d => d['Date Time'] === currentTime);
    const dataMap = new Map(filteredData.map(d => [+d.ID, d]));
    currentRoomData.forEach(room => {
        room.csvData = dataMap.get(room.id);
    });

    initFloorMap("#map-container-1", 1, currentRoomData);
    initFloorMap("#map-container-2", 2, currentRoomData);
    initFloorMap("#map-container-3", 3, currentRoomData);
    
    // Explicit initialization to paint the floor plan colors natively on mount
    updateAllMaps();
    
}).catch(error => {
    console.error("Error loading data:", error);
});

window.showFloor = function(floorNum) {
    currentFloor = floorNum; // Update global visible floor
    d3.selectAll(".floor-section").classed("active", false);
    d3.selectAll(".tab-button").classed("active", false);
    d3.select(`#floor-section-${floorNum}`).classed("active", true);
    d3.select(`#tab-floor${floorNum}`).classed("active", true);
    
    // Restoring auto-rotation on floor switch
    Object.values(floorScenes).forEach(ctx => {
        ctx.controls.autoRotate = true;
    });

    if (floorScenes[floorNum]) {
        const ctx = floorScenes[floorNum];
        setTimeout(() => {
            const width = ctx.container.clientWidth - 20;
            const height = ctx.container.clientHeight - 20;
            ctx.renderer.setSize(width, height);
            ctx.camera.aspect = width / height;
            ctx.camera.updateProjectionMatrix();
        }, 350); 
    }
};