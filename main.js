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
let isBusynessVisible = true;
let isNoiseWaveVisible = true;
let appMode = 'explore';
let colorMode = 'bivariate'; // 'bivariate' | 'busyness' | 'noise'

const ACTIVITY_COLORS = {
    studying: '#3B82F6',
    talking: '#F59E0B',
    eating: '#10B981'
};

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
    flatFloorMesh.renderOrder = 1; // Base layer
    scene.add(flatFloorMesh);

    // BUSYNESS TOPOGRAPHY (Blue wireframe — Total num students → height)
    const busynessPlaneGeo = new THREE.PlaneGeometry(1000, 1000, 150, 150);
    const busynessColors = [];
    for (let i = 0; i < busynessPlaneGeo.attributes.position.count; i++) {
        busynessColors.push(0.23, 0.51, 0.96); // #3B82F6 blue
    }
    busynessPlaneGeo.setAttribute('color', new THREE.Float32BufferAttribute(busynessColors, 3));
    const busynessMat = new THREE.MeshPhongMaterial({
        vertexColors: true, transparent: true, opacity: 0.75,
        side: THREE.FrontSide, shininess: 90, wireframe: true
    });
    const busynessMesh = new THREE.Mesh(busynessPlaneGeo, busynessMat);
    busynessMesh.position.z = 30;
    busynessMesh.renderOrder = 5; // Above map, below tiles
    scene.add(busynessMesh);

    // NOISE TOPOGRAPHY (Gold wireframe — Decibel level → height)
    const noisePlaneGeo = new THREE.PlaneGeometry(1000, 1000, 150, 150);
    const noiseColors = [];
    for (let i = 0; i < noisePlaneGeo.attributes.position.count; i++) {
        noiseColors.push(0.7, 0.64, 0.41); // #B3A369 gold
    }
    noisePlaneGeo.setAttribute('color', new THREE.Float32BufferAttribute(noiseColors, 3));
    const noiseSurfaceMat = new THREE.MeshPhongMaterial({
        vertexColors: true, transparent: true, opacity: 0.75,
        side: THREE.FrontSide, shininess: 90, wireframe: true
    });
    const noiseSurfaceMesh = new THREE.Mesh(noisePlaneGeo, noiseSurfaceMat);
    noiseSurfaceMesh.position.z = 40; 
    noiseSurfaceMesh.renderOrder = 5; // Above map, below tiles
    scene.add(noiseSurfaceMesh);

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
        
        const nameLabel = createLabelSprite(d.name, 18, "#003057", false);
        nameLabel.position.set(0, 0, 10); 
        nameLabel.renderOrder = 110; 
        nameLabel.material.depthTest = false;
        boxMesh.add(nameLabel);
        boxMesh.userData.nameLabel = nameLabel; 

        // Activity Composition Glyph Group
        const glyphGroup = new THREE.Group();
        glyphGroup.position.set(0, 0, 10); 
        glyphGroup.renderOrder = 100;
        boxMesh.add(glyphGroup);
        boxMesh.userData.glyphGroup = glyphGroup;

        // Ring segments - Explicit NormalBlending to avoid parent Multiply blending
        const ringStudy = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ACTIVITY_COLORS.studying, side: THREE.DoubleSide, depthTest: false,transparent: false }));
        const ringTalking = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ACTIVITY_COLORS.talking, side: THREE.DoubleSide, depthTest: false, transparent: false }));
        const ringEating = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ACTIVITY_COLORS.eating, side: THREE.DoubleSide, depthTest: false, transparent: false }));
        
        [ringStudy, ringTalking, ringEating].forEach(r => { 
            r.userData.isRing = true;
            r.renderOrder = 100;
            glyphGroup.add(r);
        });
        boxMesh.userData.rings = { study: ringStudy, talking: ringTalking, eating: ringEating };

        // Dominant Activity Dot - Explicit NormalBlending
        const dotGeo = new THREE.CircleGeometry(12, 32);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, depthTest: false, blending: THREE.NormalBlending, transparent: false });
        const dotMesh = new THREE.Mesh(dotGeo, dotMat);
        dotMesh.visible = false;
        dotMesh.userData.isDot = true;
        dotMesh.renderOrder = 100;
        glyphGroup.add(dotMesh);
        boxMesh.userData.activityDot = dotMesh;

        // Add structural faint boundary lines
        const edges = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1 });
        const lineMesh = new THREE.LineSegments(edges, lineMat);
        lineMesh.renderOrder = 2; 
        boxMesh.add(lineMesh);
        boxMesh.userData.lineMesh = lineMesh;
        boxMesh.userData.baseOpacity = 0.85;
        
        boxMesh.renderOrder = 10;
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
        container, renderer, scene, camera, controls,
        busynessPlaneGeo, busynessMesh,
        noisePlaneGeo, noiseSurfaceMesh,
        raycaster, mouse, interactableMeshes, floorRooms,
        hoveredBox: null, floorNum: floorNum
    };

    updateFloorDisplacement(floorNum);
}

function animate() {
    requestAnimationFrame(animate);

    Object.values(floorScenes).forEach(ctx => {
        // Zoom-based visibility logic for activity glyphs
        const dist = ctx.camera.position.distanceTo(ctx.controls.target);
        const isZoomedOut = dist > 1000;

        ctx.interactableMeshes.forEach(mesh => {
            const room = mesh.userData;
            if (room.glyphGroup) {
                room.glyphGroup.children.forEach(child => {
                    if (child.userData.isRing) child.visible = !isZoomedOut;
                    if (child.userData.isDot) child.visible = isZoomedOut;
                });
            }
        });
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
                    const noise = +d.csvData['Decibel level (dBA)'];
                    const students = +d.csvData['Total num students'];
                    const noise_t = Math.max(0, Math.min(1, (noise - 45) / 27));
                    const busy_t  = Math.max(0, Math.min(1, students / 65));

                    // Individual axis colors
                    const blueR = Math.round(255 + (46  - 255) * busy_t);
                    const blueG = Math.round(255 + (75  - 255) * busy_t);
                    const blueB = Math.round(255 + (126 - 255) * busy_t);
                    const goldR = Math.round(255 + (179 - 255) * noise_t);
                    const goldG = Math.round(255 + (163 - 255) * noise_t);
                    const goldB = Math.round(255 + (105 - 255) * noise_t);
                    const busynessColor = `rgb(${blueR},${blueG},${blueB})`;
                    const noiseColor    = `rgb(${goldR},${goldG},${goldB})`;
                    const bivariateColor = getBivariateColor(busy_t, noise_t);

                    const busyPercent = Math.round(busy_t * 100);

                    tooltipContent += `
                    <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 7px;">
                            <div style="width: 12px; height: 12px; border-radius: 3px; background: ${busynessColor}; border: 1px solid rgba(0,0,0,0.1); flex-shrink: 0;"></div>
                            <span style="color: #333;"><b>Busyness:</b> <strong style="color: #2e4b7e;">${busyPercent}% (${students} students)</strong></span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 7px;">
                            <div style="width: 12px; height: 12px; border-radius: 3px; background: ${noiseColor}; border: 1px solid rgba(0,0,0,0.1); flex-shrink: 0;"></div>
                            <span style="color: #333;"><b>Noise:</b> <strong style="color: #B3A369;">${noise} dBA</strong></span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 7px; margin-bottom: 10px;">
                        <div style="width: 12px; height: 12px; border-radius: 3px; background: ${bivariateColor}; border: 1px solid rgba(0,0,0,0.12); flex-shrink: 0;"></div>
                        <div style="font-size: 11px; color: #64748b; line-height: 1.4;"><b>Bivariate color:</b> Noise + busyness</div>
                    </div>`;
                    const nStudy = +d.csvData['Num studying'] || 0;
                    const nEating = +d.csvData['Num eating'] || 0;
                    const nTalking = +d.csvData['Num talking'] || 0;
                    const totalAct = nStudy + nEating + nTalking;
                    
                    const pStudy = totalAct > 0 ? Math.round((nStudy / totalAct) * 100) : 0;
                    const pEating = totalAct > 0 ? Math.round((nEating / totalAct) * 100) : 0;
                    const pTalking = totalAct > 0 ? Math.round((nTalking / totalAct) * 100) : 0;

                    tooltipContent += `
                    <div style="font-size: 11px; color: #555555; border-top: 1px dashed #e0e0e0; padding-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div style="width: 8px; height: 8px; border-radius: 50%; background: #3B82F6; flex-shrink: 0;"></div>
                            <span>${nStudy} studying (${pStudy}%)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; flex-shrink: 0;"></div>
                            <span>${nEating} eating (${pEating}%)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div style="width: 8px; height: 8px; border-radius: 50%; background: #F59E0B; flex-shrink: 0;"></div>
                            <span>${nTalking} talking (${pTalking}%)</span>
                        </div>
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

function updateFloorDisplacement(floorNum) {
    const ctx = floorScenes[floorNum];
    if (!ctx) return;

    const tempColor = new THREE.Color();

    // --- BUSYNESS SURFACE (Blue, driven by Total num students) ---
    {
        const positions = ctx.busynessPlaneGeo.attributes.position;
        const colors = ctx.busynessPlaneGeo.attributes.color;
        const count = positions.count;
        const blueColor = new THREE.Color('#2e4b7e');

        for (let i = 0; i < count; i++) {
            const vx = positions.getX(i);
            const vy = positions.getY(i);
            let finalZ = 0;

            ctx.floorRooms.forEach(room => {
                if (!room.csvData) return;
                const students = +room.csvData['Total num students'];
                if (isNaN(students) || students < 1) return;
                const threeX = (room.x + room.w/2) - 500;
                const threeY = 500 - (room.y + room.h/2);
                const dx = vx - threeX, dy = vy - threeY;
                const distSq = dx*dx + dy*dy;
                const spread = (Math.max(room.w, room.h) * 0.45) ** 2;
                const heightAmplifier = (students / 65) * 700;
                finalZ += heightAmplifier * Math.exp(-distSq / spread);
            });

            const clampedZ = Math.min(finalZ, 800);
            positions.setZ(i, clampedZ);
            colors.setXYZ(i, blueColor.r, blueColor.g, blueColor.b);
        }
        ctx.busynessPlaneGeo.attributes.position.needsUpdate = true;
        ctx.busynessPlaneGeo.attributes.color.needsUpdate = true;
        ctx.busynessPlaneGeo.computeVertexNormals();
    }

    // --- NOISE SURFACE (Gold, driven by Decibel level) ---
    {
        const positions = ctx.noisePlaneGeo.attributes.position;
        const colors = ctx.noisePlaneGeo.attributes.color;
        const count = positions.count;
        const goldColor = new THREE.Color('#B3A369');
        const MAX_DB = 80; const MIN_DB = 35;

        for (let i = 0; i < count; i++) {
            const vx = positions.getX(i);
            const vy = positions.getY(i);
            let finalZ = 0;

            ctx.floorRooms.forEach(room => {
                if (!room.csvData) return;
                const db = +room.csvData['Decibel level (dBA)'];
                if (isNaN(db) || db < 1) return;
                const threeX = (room.x + room.w/2) - 500;
                const threeY = 500 - (room.y + room.h/2);
                const dx = vx - threeX, dy = vy - threeY;
                const distSq = dx*dx + dy*dy;
                const spread = (Math.max(room.w, room.h) * 0.45) ** 2;
                const normalized = Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));
                const heightAmplifier = normalized * 700;
                finalZ += heightAmplifier * Math.exp(-distSq / spread);
            });

            const clampedZ = Math.min(finalZ, 800);
            positions.setZ(i, clampedZ);
            colors.setXYZ(i, goldColor.r, goldColor.g, goldColor.b);
        }
        ctx.noisePlaneGeo.attributes.position.needsUpdate = true;
        ctx.noisePlaneGeo.attributes.color.needsUpdate = true;
        ctx.noisePlaneGeo.computeVertexNormals();
    }

    // --- DYNAMIC LABEL HEIGHT SYNCING ---
    ctx.interactableMeshes.forEach(mesh => {
        const room = mesh.userData;
        if (!room.nameLabel) return;

        const centerX = (room.x + room.w/2) - 500;
        const centerY = 500 - (room.y + room.h/2);
        let peakZ = 0;

        ctx.floorRooms.forEach(peakRoom => {
            if (!peakRoom.csvData) return;
            const students = +peakRoom.csvData['Total num students'];
            if (isNaN(students) || students < 1) return;
            const px = (peakRoom.x + peakRoom.w/2) - 500;
            const py = 500 - (peakRoom.y + peakRoom.h/2);
            const dx = centerX - px, dy = centerY - py;
            const distSq = dx*dx + dy*dy;
            const spread = (Math.max(peakRoom.w, peakRoom.h) * 0.45) ** 2;
            peakZ += (students / 65) * 700 * Math.exp(-distSq / spread);
        });

        const anyVisible = isBusynessVisible || isNoiseWaveVisible;
        // Glyphs and Labels are now on a fixed plane at Z=5 to stay unaffected by topography peaks
    });
}

function updateAllMaps() {
    [1, 2, 3].forEach(floorNum => {
        const ctx = floorScenes[floorNum];
        if (!ctx) return;
        
        ctx.busynessMesh.material.opacity = 0.75;
        ctx.busynessMesh.visible = isBusynessVisible;
        ctx.noiseSurfaceMesh.material.opacity = 0.75;
        ctx.noiseSurfaceMesh.visible = isNoiseWaveVisible;
        
        const timeData = currentMapData.filter(d => d['Date Time'] === currentTime);
        
        ctx.floorRooms.forEach(room => {
            room.csvData = timeData.find(d => +d.ID === room.id);
        });

        // Loop through floor tiles to paint Univariate Dynamics
        ctx.interactableMeshes.forEach(mesh => {
            const rm = mesh.userData;
            if (rm.csvData) {
                const noise = +rm.csvData['Decibel level (dBA)'];
                const students = +rm.csvData['Total num students'];
                const noise_t = Math.max(0, Math.min(1, (noise - 45) / 27));
                const busy_t = Math.max(0, Math.min(1, students / 65));
                mesh.material.color.set(getBivariateColor(busy_t, noise_t));
                
                const numStudents = +rm.csvData['Total num students'];
                
                const numStudying = +rm.csvData['Num studying'] || 0;
                const numTalking = +rm.csvData['Num talking'] || 0;
                const numEating = +rm.csvData['Num eating'] || 0;
                const totalActivity = numStudying + numTalking + numEating;

                if (mesh.userData.glyphGroup) {
                    if (totalActivity > 0) {
                        mesh.userData.glyphGroup.visible = true;
                        const sP = numStudying / totalActivity;
                        const tP = numTalking / totalActivity;
                        const eP = numEating / totalActivity;

                        const inner = 18, outer = 28;
                        const sAngle = sP * Math.PI * 2;
                        const tAngle = tP * Math.PI * 2;
                        const eAngle = eP * Math.PI * 2;

                        // Recreate geometries for arc segments
                        if (mesh.userData.rings.study.geometry) mesh.userData.rings.study.geometry.dispose();
                        if (mesh.userData.rings.talking.geometry) mesh.userData.rings.talking.geometry.dispose();
                        if (mesh.userData.rings.eating.geometry) mesh.userData.rings.eating.geometry.dispose();

                        mesh.userData.rings.study.geometry = new THREE.RingGeometry(inner, outer, 32, 1, 0, sAngle);
                        mesh.userData.rings.talking.geometry = new THREE.RingGeometry(inner, outer, 32, 1, sAngle, tAngle);
                        mesh.userData.rings.eating.geometry = new THREE.RingGeometry(inner, outer, 32, 1, sAngle + tAngle, eAngle);

                        // Update dot color to dominant activity
                        let dominant = 'studying';
                        if (numTalking > numStudying && numTalking > numEating) dominant = 'talking';
                        if (numEating > numStudying && numEating > numTalking) dominant = 'eating';
                        mesh.userData.activityDot.material.color.set(ACTIVITY_COLORS[dominant]);
                    } else {
                        mesh.userData.glyphGroup.visible = false;
                    }
                }

                // Seat Selector Filtering
                let isMatch = true;
                if (appMode === 'seat-selector') {
                    const activity = document.getElementById('filter-activity').value;
                    const noisePref = document.getElementById('filter-noise').value;
                    const groupSize = document.getElementById('filter-group-size').value;
                    
                    const numStudents = +rm.csvData['Total num students'];
                    
                    // Filter: Activity
                    if (activity === 'studying' && numStudying < 2) isMatch = false;
                    if (activity === 'eating' && numEating < 2) isMatch = false;
                    if (activity === 'talking' && numTalking < 2) isMatch = false;
                    
                    // Filter: Noise
                    if (noisePref === 'quiet' && noise > 55) isMatch = false;
                    if (noisePref === 'moderate' && (noise < 50 || noise > 65)) isMatch = false;
                    if (noisePref === 'loud' && noise < 65) isMatch = false;
                    
                    // Filter: Group Size (avoid areas that are already too crowded for a large group)
                    if (groupSize === 'medium' && numStudents > 25) isMatch = false;
                    if (groupSize === 'large' && numStudents > 15) isMatch = false;
                }
                
                mesh.userData.baseOpacity = isMatch ? 0.85 : 0.05;
                mesh.material.opacity = mesh.userData.baseOpacity; 
                mesh.material.visible = true;
                mesh.material.blending = THREE.MultiplyBlending;
                mesh.material.depthTest = true;
            } else {
                mesh.material.visible = false;
            }
        });

        // Trigger rebuild
        updateFloorDisplacement(floorNum);
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

document.getElementById('toggle-busyness-wave').addEventListener('change', function(e) {
    isBusynessVisible = e.target.checked;
    updateAllMaps();
});

document.getElementById('toggle-noise-wave').addEventListener('change', function(e) {
    isNoiseWaveVisible = e.target.checked;
    updateAllMaps();
});

window.setMode = function(mode) {
    appMode = mode;
    
    // UI Updates
    document.getElementById('btn-explore').classList.toggle('active', mode === 'explore');
    document.getElementById('btn-seat-selector').classList.toggle('active', mode === 'seat-selector');
    
    const toggleContainer = document.getElementById('mode-toggle');
    if (mode === 'seat-selector') {
        toggleContainer.classList.add('seat-selector-active');
        document.getElementById('seat-selector-panel').style.display = 'block';
    } else {
        toggleContainer.classList.remove('seat-selector-active');
        document.getElementById('seat-selector-panel').style.display = 'none';
    }
    
    // Trigger map update
    updateAllMaps();
    
    // Handle resizing of the WebGL canvas since flex layout changes width
    setTimeout(() => {
        Object.values(floorScenes).forEach(ctx => {
            if (ctx.container && ctx.renderer) {
                const width = ctx.container.clientWidth - 20;
                const height = ctx.container.clientHeight - 20;
                ctx.renderer.setSize(width, height);
                ctx.camera.aspect = width / height;
                ctx.camera.updateProjectionMatrix();
            }
        });
    }, 350);
};

window.updateFilters = function() {
    updateAllMaps();
};

function getBivariateColor(busy_t, noise_t) {
    // Blue channel: white → #2e4b7e (busyness)
    const bR = Math.round(255 + (46  - 255) * busy_t);
    const bG = Math.round(255 + (75  - 255) * busy_t);
    const bB = Math.round(255 + (126 - 255) * busy_t);
    // Gold channel: white → #B3A369 (noise)
    const gR = Math.round(255 + (179 - 255) * noise_t);
    const gG = Math.round(255 + (163 - 255) * noise_t);
    const gB = Math.round(255 + (105 - 255) * noise_t);

    if (colorMode === 'busyness') return `rgb(${bR},${bG},${bB})`;
    if (colorMode === 'noise')    return `rgb(${gR},${gG},${gB})`;
    // Bivariate: multiplicative blend (white * anything = anything; corner = mix)
    const r = Math.round(bR * gR / 255);
    const g = Math.round(bG * gG / 255);
    const b = Math.round(bB * gB / 255);
    return `rgb(${r},${g},${b})`;
}

function drawBivariateGrid() {
    const grid = document.getElementById('bivariate-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const N = 4;
    // Rows: noise high (top) → low (bottom); Cols: busy low (left) → high (right)
    for (let ni = N - 1; ni >= 0; ni--) {
        for (let bi = 0; bi < N; bi++) {
            const cell = document.createElement('div');
            cell.style.cssText = 'width:20px;height:20px;border-radius:3px;border:1px solid rgba(0,0,0,0.07);';
            // Always draw bivariate grid regardless of mode
            const savedMode = colorMode;
            colorMode = 'bivariate';
            cell.style.background = getBivariateColor(bi / (N - 1), ni / (N - 1));
            colorMode = savedMode;
            grid.appendChild(cell);
        }
    }
}

function getSurfaceColor(intensityNormal) {
    return '#2e4b7e';
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
    drawBivariateGrid();

    // Radio button listeners for color mode
    document.querySelectorAll('input[name="color-mode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            colorMode = this.value;
            updateAllMaps();
        });
    });
    
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