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
        depthTest: false,
        sizeAttenuation: false // Fixed size in screen space
    });
    const sprite = new THREE.Sprite(spriteMaterial);

    // Scale sprite to a constant screen-relative size
    const aspect = canvas.width / canvas.height;
    const baseH = 0.032; // Reduced from 0.045 to be less distracting
    sprite.scale.set(aspect * baseH, baseH, 1);

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
let currentTime = "12:00 PM";
let currentSliderValue = 12;
let currentFloor = 1;
let isTooltipLocked = false;
let lockedObject = null;

function getTooltipHTML(d) {
    const hour = currentSliderValue > 12 ? currentSliderValue - 12 : currentSliderValue;
    const mediaName = `${hour}-${d.id}`;

    let content = `<strong style="color: #003057; font-size: 15px; text-transform: uppercase;">${d.name}</strong><br/>
        <span style="color: #666666; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Area ${d.id} | Floor ${d.floor}</span><br/>
        <hr style="border:none; border-top:1px solid #e0e0e0; margin: 8px 0;">`;

    if (d.csvData) {
        content += `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; margin-bottom: 8px;">
            <span style="color: #333333"><b>Students:</b> <strong style="color: #003057">${d.csvData['Total num students']}</strong></span>
            <span style="color: #333333"><b>Noise:</b> <strong style="color: #B3A369">${d.csvData['Decibel level (dBA)']} dBA</strong></span>
        </div>
        <div style="font-size: 11px; color: #555555; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; margin-bottom: 8px;">
            ${d.csvData['Num studying']} studying &middot; ${d.csvData['Num eating']} eating &middot; ${d.csvData['Num talking']} talking &middot; ${d.csvData['Num on phone']} on phone
        </div>`;
    }

    // Add Image
    content += `<div style="margin-bottom: 10px;">
        <img src="data/images/${mediaName}.jpeg" style="width: 100%; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" onerror="this.style.display='none'">
    </div>`;

    // Add Audio
    content += `<div>
        <audio controls style="width: 100%; height: 35px;">
            <source src="data/m4a/${mediaName}.m4a" type="audio/mp4">
            Your browser does not support the audio element.
        </audio>
    </div>`;

    return content;
}
let isCrowdednessVisible = false;
let isNoiseWaveVisible = false;
let appMode = 'explore';
let colorMode = 'bivariate'; // 'bivariate' | 'crowdedness' | 'noise'

const ACTIVITY_COLORS = {
    studying: '#3B82F6',
    talking: '#F59E0B',
    eating: '#10B981',
    phone: '#8B5CF6' // Purple
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

    // CROWDEDNESS TOPOGRAPHY (Blue wireframe — Total num students → height)
    const crowdednessPlaneGeo = new THREE.PlaneGeometry(1000, 1000, 150, 150);
    const crowdednessColors = [];
    for (let i = 0; i < crowdednessPlaneGeo.attributes.position.count; i++) {
        crowdednessColors.push(0.23, 0.51, 0.96); // #284d89ff blue
    }
    crowdednessPlaneGeo.setAttribute('color', new THREE.Float32BufferAttribute(crowdednessColors, 3));
    const crowdednessMat = new THREE.MeshPhongMaterial({
        vertexColors: true, transparent: true, opacity: 0.75,
        side: THREE.FrontSide, shininess: 90, wireframe: true
    });
    const crowdednessMesh = new THREE.Mesh(crowdednessPlaneGeo, crowdednessMat);
    crowdednessMesh.position.z = 30;
    crowdednessMesh.renderOrder = 5; // Above map, below tiles
    scene.add(crowdednessMesh);

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
        const posX = (d.x + d.w / 2) - 500;
        const posY = 500 - (d.y + d.h / 2);
        boxMesh.position.set(posX, posY, 2);
        boxMesh.userData = d;

        const nameLabel = createLabelSprite(d.name, 26, "#003057", true);
        nameLabel.position.set(0, 0, 15); // Elevated above glyphs
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
        const ringStudy = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ACTIVITY_COLORS.studying, side: THREE.DoubleSide, depthTest: false, transparent: false }));
        const ringTalking = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ACTIVITY_COLORS.talking, side: THREE.DoubleSide, depthTest: false, transparent: false }));
        const ringEating = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ACTIVITY_COLORS.eating, side: THREE.DoubleSide, depthTest: false, transparent: false }));
        const ringPhone = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ACTIVITY_COLORS.phone, side: THREE.DoubleSide, depthTest: false, transparent: false }));

        [ringStudy, ringTalking, ringEating, ringPhone].forEach(r => {
            r.userData.isRing = true;
            r.renderOrder = 100;
            glyphGroup.add(r);
        });
        boxMesh.userData.rings = { study: ringStudy, talking: ringTalking, eating: ringEating, phone: ringPhone };

        // Dominant Activity Dot - Explicit NormalBlending
        const dotGeo = new THREE.CircleGeometry(10, 32);
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
        if (!isTooltipLocked) {
            tooltip.transition().duration(400).style("opacity", 0);
        }
    };
    renderer.domElement.addEventListener('mouseleave', onMouseLeave, false);

    const onMouseClick = (event) => {
        if (floorNum !== currentFloor) return;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(interactableMeshes, false);

        if (intersects.length > 0) {
            isTooltipLocked = true;
            lockedObject = intersects[0].object;

            interactableMeshes.forEach(m => {
                m.userData.lineMesh.material.color.setHex(0x000000);
                m.userData.lineMesh.material.opacity = 0.1;
                m.material.opacity = m.userData.baseOpacity;
            });
            lockedObject.userData.lineMesh.material.color.setHex(0xB3A369);
            lockedObject.userData.lineMesh.material.opacity = 1.0;
            lockedObject.material.opacity = 1.0;

            tooltip.transition().duration(100).style("opacity", 1);
            tooltip.html(getTooltipHTML(lockedObject.userData))
                .style("left", mouse.pageX + "px")
                .style("top", mouse.pageY + "px")
                .style("pointer-events", "auto");
        } else {
            if (isTooltipLocked) {
                interactableMeshes.forEach(m => {
                    m.userData.lineMesh.material.color.setHex(0x000000);
                    m.userData.lineMesh.material.opacity = 0.1;
                    m.material.opacity = m.userData.baseOpacity;
                });
            }
            isTooltipLocked = false;
            lockedObject = null;
            tooltip.transition().duration(400).style("opacity", 0);
            tooltip.style("pointer-events", "none");
        }
    };
    renderer.domElement.addEventListener('click', onMouseClick, false);

    floorScenes[floorNum] = {
        container, renderer, scene, camera, controls,
        crowdednessPlaneGeo, crowdednessMesh,
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
        if (ctx.floorNum === currentFloor) {
            ctx.controls.update();

            ctx.raycaster.setFromCamera(ctx.mouse, ctx.camera);
            const intersects = ctx.raycaster.intersectObjects(ctx.interactableMeshes, false);

            if (intersects.length > 0) {
                const hovered = intersects[0].object;
                const d = hovered.userData;

                if (ctx.hoveredBox !== hovered && !isTooltipLocked) {
                    // Reset old box visuals
                    if (ctx.hoveredBox && ctx.hoveredBox !== lockedObject) {
                        ctx.hoveredBox.material.opacity = ctx.hoveredBox.userData.baseOpacity;
                        ctx.hoveredBox.userData.lineMesh.material.color.setHex(0x000000);
                        ctx.hoveredBox.userData.lineMesh.material.opacity = 0.1;
                    }

                    // Light up newly hovered box borders
                    ctx.hoveredBox = hovered;
                    ctx.hoveredBox.material.opacity = 1.0;
                    ctx.hoveredBox.userData.lineMesh.material.color.setHex(0xB3A369); // GT Gold Edge
                    ctx.hoveredBox.userData.lineMesh.material.opacity = 1.0;

                    tooltip.transition().duration(100).style("opacity", 1);
                }

                if (!isTooltipLocked) {
                    tooltip.html(getTooltipHTML(d))
                        .style("left", ctx.mouse.pageX + "px")
                        .style("top", ctx.mouse.pageY + "px")
                        .style("pointer-events", "none");
                }
            } else {
                if (ctx.hoveredBox !== null && !isTooltipLocked) {
                    if (ctx.hoveredBox !== lockedObject) {
                        ctx.hoveredBox.material.opacity = ctx.hoveredBox.userData.baseOpacity;
                        ctx.hoveredBox.userData.lineMesh.material.color.setHex(0x000000);
                        ctx.hoveredBox.userData.lineMesh.material.opacity = 0.1;
                    }
                    ctx.hoveredBox = null;
                    tooltip.transition().duration(400).style("opacity", 0);
                }
            }

            // Dynamic Scaling for Glyphs to maintain constant screen size
            const dist = ctx.camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
            const glyphScale = dist / 1500; // More conservative scaling (smaller on screen)
            ctx.interactableMeshes.forEach(mesh => {
                if (mesh.userData.glyphGroup) {
                    mesh.userData.glyphGroup.scale.set(glyphScale, glyphScale, 1);
                }
            });

            ctx.renderer.render(ctx.scene, ctx.camera);
        }
    });
}
animate();

function updateFloorDisplacement(floorNum) {
    const ctx = floorScenes[floorNum];
    if (!ctx) return;

    const tempColor = new THREE.Color();

    // --- CROWDEDNESS SURFACE (Blue, driven by Total num students) ---
    {
        const positions = ctx.crowdednessPlaneGeo.attributes.position;
        const colors = ctx.crowdednessPlaneGeo.attributes.color;
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
                const threeX = (room.x + room.w / 2) - 500;
                const threeY = 500 - (room.y + room.h / 2);
                const dx = vx - threeX, dy = vy - threeY;
                const distSq = dx * dx + dy * dy;
                const spread = (Math.max(room.w, room.h) * 0.45) ** 2;
                const heightAmplifier = (students / 65) * 700;
                finalZ += heightAmplifier * Math.exp(-distSq / spread);
            });

            const clampedZ = Math.min(finalZ, 800);
            positions.setZ(i, clampedZ);
            colors.setXYZ(i, blueColor.r, blueColor.g, blueColor.b);
        }
        ctx.crowdednessPlaneGeo.attributes.position.needsUpdate = true;
        ctx.crowdednessPlaneGeo.attributes.color.needsUpdate = true;
        ctx.crowdednessPlaneGeo.computeVertexNormals();
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
                const threeX = (room.x + room.w / 2) - 500;
                const threeY = 500 - (room.y + room.h / 2);
                const dx = vx - threeX, dy = vy - threeY;
                const distSq = dx * dx + dy * dy;
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

        const centerX = (room.x + room.w / 2) - 500;
        const centerY = 500 - (room.y + room.h / 2);
        let peakZ = 0;

        ctx.floorRooms.forEach(peakRoom => {
            if (!peakRoom.csvData) return;
            const students = +peakRoom.csvData['Total num students'];
            if (isNaN(students) || students < 1) return;
            const px = (peakRoom.x + peakRoom.w / 2) - 500;
            const py = 500 - (peakRoom.y + peakRoom.h / 2);
            const dx = centerX - px, dy = centerY - py;
            const distSq = dx * dx + dy * dy;
            const spread = (Math.max(peakRoom.w, peakRoom.h) * 0.45) ** 2;
            peakZ += (students / 65) * 700 * Math.exp(-distSq / spread);
        });

        const anyVisible = isCrowdednessVisible || isNoiseWaveVisible;
        // Glyphs and Labels are now on a fixed plane at Z=5 to stay unaffected by topography peaks
    });
}

function updateAllMaps() {
    [1, 2, 3].forEach(floorNum => {
        const ctx = floorScenes[floorNum];
        if (!ctx) return;

        ctx.crowdednessMesh.material.opacity = 0.75;
        ctx.crowdednessMesh.visible = isCrowdednessVisible;
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
                const numPhone = +rm.csvData['Num on phone'] || 0;
                const totalActivity = numStudying + numTalking + numEating + numPhone;

                if (mesh.userData.glyphGroup) {
                    if (totalActivity > 0) {
                        mesh.userData.glyphGroup.visible = true;
                        const sP = numStudying / totalActivity;
                        const tP = numTalking / totalActivity;
                        const eP = numEating / totalActivity;
                        const pP = numPhone / totalActivity;

                        const inner = 20, outer = 44; 
                        const sAngle = sP * Math.PI * 2;
                        const tAngle = tP * Math.PI * 2;
                        const eAngle = eP * Math.PI * 2;
                        const pAngle = pP * Math.PI * 2;

                        // Recreate geometries for arc segments
                        if (mesh.userData.rings.study.geometry) mesh.userData.rings.study.geometry.dispose();
                        if (mesh.userData.rings.talking.geometry) mesh.userData.rings.talking.geometry.dispose();
                        if (mesh.userData.rings.eating.geometry) mesh.userData.rings.eating.geometry.dispose();
                        if (mesh.userData.rings.phone.geometry) mesh.userData.rings.phone.geometry.dispose();

                        mesh.userData.rings.study.geometry = new THREE.RingGeometry(inner, outer, 32, 1, 0, sAngle);
                        mesh.userData.rings.talking.geometry = new THREE.RingGeometry(inner, outer, 32, 1, sAngle, tAngle);
                        mesh.userData.rings.eating.geometry = new THREE.RingGeometry(inner, outer, 32, 1, sAngle + tAngle, eAngle);
                        mesh.userData.rings.phone.geometry = new THREE.RingGeometry(inner, outer, 32, 1, sAngle + tAngle + eAngle, pAngle);

                        // Update dot color to dominant activity
                        let dominant = 'studying';
                        let maxVal = numStudying;
                        if (numTalking > maxVal) { dominant = 'talking'; maxVal = numTalking; }
                        if (numEating > maxVal) { dominant = 'eating'; maxVal = numEating; }
                        if (numPhone > maxVal) { dominant = 'phone'; maxVal = numPhone; }
                        mesh.userData.activityDot.material.color.set(ACTIVITY_COLORS[dominant]);
                    } else {
                        mesh.userData.glyphGroup.visible = false;
                    }
                }

                // Seat Selector Filtering (Area Selector)
                let isMatch = true;
                if (appMode === 'seat-selector') {
                    // We can keep all rooms visible or implement a soft-filter here.
                    // For now, let's keep them visible so the user can see the highlighted top 3.
                    isMatch = true; 
                }

                mesh.userData.baseOpacity = isMatch ? 0.85 : 0.05;
                // In 'none' mode, we keep the mesh opaque (1.0) but colored white with Multiply blending,
                // which makes the room color invisible while keeping the tooltip raycasting active.
                mesh.material.opacity = (colorMode === 'none' && isMatch) ? 1.0 : mesh.userData.baseOpacity;
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

    if (isTooltipLocked && lockedObject) {
        tooltip.html(getTooltipHTML(lockedObject.userData));
    }

    if (appMode === 'analytics') {
        renderAnalytics();
    }
}

d3.select("#btn-12pm").on("click", function () {
    d3.selectAll(".time-toggle button").classed("active", false);
    d3.select(this).classed("active", true);
    currentTime = "4/7/2026 12:00";
    updateAllMaps();
});

d3.select("#btn-8pm").on("click", function () {
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

function updateThemeColor(val) {
    const t = (val - 12) / 8; // 0 at 12pm, 1 at 8pm

    // Interpolate between GT Gold (179,163,105) and GT Blue (0,48,87)
    const r = Math.round(179 + (0 - 179) * t);
    const g = Math.round(163 + (48 - 163) * t);
    const b = Math.round(105 + (87 - 105) * t);

    // We only update the 3D scene background now, keeping the map environment dynamic
    // Reducing lerp from 0.9 to 0.8 for more vibrant colors
    const sceneColor = new THREE.Color(`rgb(${r}, ${g}, ${b})`).lerp(new THREE.Color(1, 1, 1), 0.82);

    // Update All Scenes
    Object.values(floorScenes).forEach(ctx => {
        if (ctx.scene) {
            ctx.scene.background = sceneColor;
        }
    });
}

function onSliderChange(val) {
    currentSliderValue = parseInt(val);
    document.getElementById('slider-time-label').innerText = formatSliderTime(currentSliderValue);

    updateThemeColor(currentSliderValue);

    // Map numeric 12, 14, 16, 18, 20 to "12:00 PM", "2:00 PM", etc.
    const hr = currentSliderValue > 12 ? currentSliderValue - 12 : currentSliderValue;
    currentTime = `${hr}:00 PM`;
    updateAllMaps();
}

document.getElementById('toggle-crowdedness-wave').addEventListener('change', function (e) {
    isCrowdednessVisible = e.target.checked;
    updateAllMaps();
});

document.getElementById('toggle-noise-wave').addEventListener('change', function (e) {
    isNoiseWaveVisible = e.target.checked;
    updateAllMaps();
});

window.setMode = function (mode) {
    appMode = mode;

    // UI Updates
    document.getElementById('btn-explore').classList.toggle('active', mode === 'explore');
    document.getElementById('btn-seat-selector').classList.toggle('active', mode === 'seat-selector');
    document.getElementById('btn-analytics')?.classList.toggle('active', mode === 'analytics');

    // Clear tooltips on mode switch
    if (typeof tooltip !== 'undefined') {
        tooltip.style("opacity", 0).style("pointer-events", "none");
    }
    isTooltipLocked = false;
    lockedObject = null;

    const toggleContainer = document.getElementById('mode-toggle');
    toggleContainer.classList.toggle('seat-selector-active', mode === 'seat-selector');
    toggleContainer.classList.toggle('analytics-active', mode === 'analytics');

    const selectorPanel = document.getElementById('seat-selector-panel');
    const analyticsView = document.getElementById('analytics-view');
    const floorsContainer = document.querySelector('.floors-container');
    const bivariateLegend = document.querySelector('.bivariate-legend');
    const instructionsPanel = document.querySelector('.instructions-panel');
    const floorTabs = document.querySelector('.floor-tabs');

    if (mode === 'seat-selector') {
        selectorPanel.style.display = 'block';
        bivariateLegend.style.display = 'none';
        floorsContainer.style.display = 'block';
    } else {
        selectorPanel.style.display = 'none';
    }

    if (mode === 'analytics') {
        analyticsView.style.display = 'block';
        floorsContainer.style.display = 'none';
        bivariateLegend.style.display = 'none';
        if (instructionsPanel) instructionsPanel.style.display = 'none';
        if (floorTabs) floorTabs.style.display = 'none';
        renderAnalytics();
    } else {
        // Hide analytics for both 'explore' and 'seat-selector'
        analyticsView.style.display = 'none';
        floorsContainer.style.display = 'block';
        
        if (mode === 'explore') {
            bivariateLegend.style.display = 'block';
            if (instructionsPanel) instructionsPanel.style.display = 'block';
            if (floorTabs) floorTabs.style.display = 'flex';
        } else {
            // area-selector specific resets (in addition to the first block)
            bivariateLegend.style.display = 'none';
            if (instructionsPanel) instructionsPanel.style.display = 'block';
            if (floorTabs) floorTabs.style.display = 'flex';
        }
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

window.updateFilters = function () {
    updateAllMaps();
};

function getBivariateColor(busy_t, noise_t) {
    // Blue channel: white → #2e4b7e (crowdedness)
    const bR = Math.round(255 + (46 - 255) * busy_t);
    const bG = Math.round(255 + (75 - 255) * busy_t);
    const bB = Math.round(255 + (126 - 255) * busy_t);
    // Gold channel: white → #B3A369 (noise)
    const gR = Math.round(255 + (179 - 255) * noise_t);
    const gG = Math.round(255 + (163 - 255) * noise_t);
    const gB = Math.round(255 + (105 - 255) * noise_t);

    if (colorMode === 'crowdedness') return `rgb(${bR},${bG},${bB})`;
    if (colorMode === 'noise') return `rgb(${gR},${gG},${gB})`;
    if (colorMode === 'none') return '#ffffff';

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
    d3.csv('Map Data Collection - Sheet1.csv')
]).then(([roomData, mapData]) => {
    currentRoomData = roomData;
    
    // Preprocess: Forward-fill "Date Time" column
    let lastTime = "";
    mapData.forEach(d => {
        if (d['Date Time'] && d['Date Time'].trim() !== "") {
            lastTime = d['Date Time'].trim();
        } else {
            d['Date Time'] = lastTime;
        }
    });
    currentMapData = mapData;

    const filteredData = currentMapData.filter(d => d['Date Time'] === currentTime);
    const dataMap = new Map(filteredData.map(d => [+d.ID, d]));
    currentRoomData.forEach(room => {
        room.csvData = dataMap.get(room.id);
    });

    initFloorMap("#map-container-1", 1, currentRoomData);
    initFloorMap("#map-container-2", 2, currentRoomData);
    initFloorMap("#map-container-3", 3, currentRoomData);

    // Explicit initialization
    updateThemeColor(currentSliderValue);
    updateAllMaps();
    drawBivariateGrid();

    // Radio button listeners for color mode
    document.querySelectorAll('input[name="color-mode"]').forEach(radio => {
        radio.addEventListener('change', function () {
            colorMode = this.value;
            updateAllMaps();
        });
    });

}).catch(error => {
    console.error("Error loading data:", error);
});

window.showFloor = function (floorNum) {
    currentFloor = floorNum; // Update global visible floor
    d3.selectAll(".floor-section").classed("active", false);
    d3.selectAll(".tab-button").classed("active", false);
    d3.select(`#floor-section-${floorNum}`).classed("active", true);
    d3.select(`#tab-floor${floorNum}`).classed("active", true);

    // Restore ambient rotation when manually switching floors
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

function renderAnalytics() {
    const timeData = currentMapData.filter(d => d['Date Time'] === currentTime);
    if (!timeData.length) return;

    // 1. Process Data by Floor
    const floors = [1, 2, 3];
    const floorData = floors.map(f => {
        const rooms = timeData.filter(d => +d.Floor === f);
        return {
            floor: `Floor ${f}`,
            noise: d3.mean(rooms, d => +d['Decibel level (dBA)']) || 0,
            crowdedness: d3.mean(rooms, d => +d['Total num students']) || 0,
            studying: d3.sum(rooms, d => +d['Num studying']) || 0,
            talking: d3.sum(rooms, d => +d['Num talking']) || 0,
            eating: d3.sum(rooms, d => +d['Num eating']) || 0,
            phone: d3.sum(rooms, d => +d['Num on phone']) || 0
        };
    });

    const margin = { top: 10, right: 30, bottom: 45, left: 50 };
    const width = document.getElementById('chart-trends').clientWidth - margin.left - margin.right;
    const height = 220 - margin.top - margin.bottom;

    // Helper: Create Tooltip
    const chartTooltip = d3.select("body").selectAll(".chart-tooltip").data([0]).join("div").attr("class", "chart-tooltip").style("opacity", 0);

    function createGroupedBarChart(containerId, data, keys, colors, xLabel) {
        const container = d3.select(`#${containerId}`);
        container.selectAll("*").remove();

        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const y0 = d3.scaleBand().rangeRound([0, height]).paddingInner(0.2).domain(data.map(d => d.floor));
        const y1 = d3.scaleBand().padding(0.1).domain(keys).rangeRound([0, y0.bandwidth()]);
        const x = d3.scaleLinear().rangeRound([0, width]).domain([0, d3.max(data, d => d3.max(keys, key => d[key])) * 1.1]);

        svg.append("g").attr("class", "chart-grid").call(d3.axisBottom(x).ticks(5).tickSize(height).tickFormat("")).select(".domain").remove();

        svg.append("g")
            .selectAll("g")
            .data(data)
            .join("g")
            .attr("transform", d => `translate(0,${y0(d.floor)})`)
            .selectAll("rect")
            .data(d => keys.map(key => ({ key, value: d[key], floor: d.floor })))
            .join("rect")
            .attr("class", "chart-bar")
            .attr("y", d => y1(d.key))
            .attr("x", 0)
            .attr("height", y1.bandwidth())
            .attr("width", d => x(d.value))
            .attr("fill", d => colors[d.key])
            .on("mouseover", function(event, d) {
                chartTooltip.transition().duration(200).style("opacity", .9);
                chartTooltip.html(`<strong>${d.floor}</strong><br/>${d.key}: ${d.value.toFixed(1)}`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => chartTooltip.transition().duration(500).style("opacity", 0));

        svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(5)).attr("class", "axis-label");
        svg.append("g").call(d3.axisLeft(y0)).attr("class", "axis-label");

        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height + 32)
            .attr("text-anchor", "middle")
            .style("font-size", "10px")
            .style("fill", "#94a3b8")
            .text(xLabel);
    }

    createGroupedBarChart("chart-trends", floorData, ["noise", "crowdedness"], 
        { noise: "#B3A369", crowdedness: "#003057" }, "Average Value per Floor");

    createGroupedBarChart("chart-activities", floorData, ["studying", "talking", "eating", "phone"], 
        { studying: ACTIVITY_COLORS.studying, talking: ACTIVITY_COLORS.talking, eating: ACTIVITY_COLORS.eating, phone: ACTIVITY_COLORS.phone }, "Total Student Count");
}

function findBestAreas() {
    const targetTimeVal = document.getElementById('filter-time').value;
    const targetNoise = document.getElementById('filter-noise-pref').value;
    const targetCrowd = document.getElementById('filter-crowd-pref').value;

    const hr = targetTimeVal > 12 ? targetTimeVal - 12 : targetTimeVal;
    const timeKey = `${hr}:00 PM`;

    const timeData = currentMapData.filter(d => d['Date Time'] === timeKey);
    if (!timeData.length) return;

    // Scoring Logic
    const scoredRooms = currentRoomData.map(room => {
        const data = timeData.find(d => +d.ID === room.id);
        if (!data) return { ...room, score: -1000 };

        const actualNoise = +data['Decibel level (dBA)'];
        const actualCrowd = +data['Total num students'];

        let score = 0;

        // Noise Score (Lower penalty is better)
        if (targetNoise === 'quiet') {
            score -= Math.abs(actualNoise - 50); 
        } else if (targetNoise === 'moderate') {
            score -= Math.abs(actualNoise - 60); 
        } else {
            score -= Math.abs(actualNoise - 72); 
        }

        // Crowdedness Score (Heavier weights to prevent noise dominance)
        if (targetCrowd === 'empty') {
            score -= (actualCrowd * 4); // Heavy penalty for any students
        } else if (targetCrowd === 'moderate') {
            score -= Math.abs(actualCrowd - 15) * 2.5; // Strong target on 15 students
        } else {
            score += (actualCrowd * 2.5); // Strong bonus for more students
        }

        return { ...room, csvData: data, score };
    });

    // Sort by score descending and take top 3
    const top3 = scoredRooms.sort((a, b) => b.score - a.score).slice(0, 3);

    // Render Results
    const container = document.getElementById('results-container');
    container.innerHTML = `<h4 style="font-size: 11px; color: #94a3b8; text-transform: uppercase; margin-bottom: 12px;">Top 3 Recommendations</h4>`;

    top3.forEach((room, i) => {
        const card = document.createElement('div');
        card.className = 'recommendation-card';
        card.onclick = () => goToArea(room.floor, room.id);
        card.innerHTML = `
            <span class="recommendation-rank">#${i+1} Best Match</span>
            <h4>${room.name}</h4>
            <p>Floor ${room.floor} &middot; ${room.csvData['Decibel level (dBA)']} dBA &middot; ${room.csvData['Total num students']} Students</p>
        `;
        container.appendChild(card);
    });
}

function goToArea(floorNum, roomID) {
    // 1. Sync Time Slider with the preference selected in the menu
    const targetTimeVal = document.getElementById('filter-time').value;
    const timeSlider = document.getElementById('timeSlider');
    if (timeSlider) {
        timeSlider.value = targetTimeVal;
        onSliderChange(targetTimeVal); // This updates label, theme, and map data
    }

    // 2. Switch Floor
    showFloor(floorNum);

    // 3. Find Mesh and Trigger Tooltip
    setTimeout(() => {
        const ctx = floorScenes[floorNum];
        if (!ctx) return;

        const mesh = ctx.interactableMeshes.find(m => m.userData.id === roomID);
        if (mesh) {
            // Disable rotation to focus on the result
            ctx.controls.autoRotate = false;
            
            // Simulate hover / lock
            isTooltipLocked = true;
            lockedObject = mesh;
            
            // Position tooltip
            const rect = ctx.renderer.domElement.getBoundingClientRect();
            
            // Calculate screen position
            const vector = new THREE.Vector3();
            mesh.getWorldPosition(vector);
            vector.project(ctx.camera);

            const x = (vector.x * 0.5 + 0.5) * rect.width + rect.left;
            const y = (-(vector.y * 0.5 - 0.5) * rect.height) + rect.top;

            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(getTooltipHTML(mesh.userData))
                .style("left", x + "px")
                .style("top", y + "px");

            // Focus Camera
            const targetPos = new THREE.Vector3();
            mesh.getWorldPosition(targetPos);
            ctx.controls.target.lerp(targetPos, 0.5);
            ctx.controls.update();
        }
    }, 400);
}