// Setup Tooltip
const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background", "rgba(255, 255, 255, 0.95)")
    .style("backdrop-filter", "blur(4px)")
    .style("padding", "12px")
    .style("border", "1px solid #e2e8f0")
    .style("border-radius", "8px")
    .style("box-shadow", "0 4px 6px -1px rgba(0, 0, 0, 0.1)")
    .style("pointer-events", "none")
    .style("font-family", "'Inter', sans-serif")
    .style("font-size", "13px")
    .style("color", "#334155")
    .style("z-index", 10);

function drawFloorMap(containerId, floorNum, roomData) {
    // Set up the bounds
    const width = 1000;
    const height = 1000;

    const container = d3.select(containerId)
        .style("position", "relative");

    // Append an SVG element without margins mapping exactly to image
    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`);

    // Filter rooms for this specific floor map
    const floorRooms = roomData.filter(d => d.floor === floorNum);

    // 1) Base image - grayed out and faded for non-interactive areas
    svg.append("image")
        .attr("href", `public/floor${floorNum}.png`)
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", width)
        .attr("height", height)
        .attr("preserveAspectRatio", "none")
        .style("filter", "grayscale(100%) opacity(0.4)");

    // 2) Mask definition for interactive areas
    const defs = svg.append("defs");
    const maskId = `interactive-mask-${floorNum}`;
    const mask = defs.append("mask").attr("id", maskId);

    // Black background for mask (hides everything)
    mask.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "black");

    // White rects for mask (shows interactive areas)
    mask.selectAll(".show-hole")
        .data(floorRooms)
        .enter()
        .append("rect")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("width", d => d.w)
        .attr("height", d => d.h)
        .attr("fill", "white");

    // 3) Colored/vibrant image masked to interactive parts
    svg.append("image")
        .attr("href", `public/floor${floorNum}.png`)
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", width)
        .attr("height", height)
        .attr("preserveAspectRatio", "none")
        .attr("mask", `url(#${maskId})`);

    const rooms = svg.selectAll(".room-group")
        .data(floorRooms)
        .enter()
        .append("g")
        .attr("class", "room-group");
        
    rooms.append("rect")
        .attr("class", "room-rect")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("width", d => d.w) 
        .attr("height", d => d.h) 
        .style("fill", "lightblue")
        .on("mouseover", function(event, d) {
            d3.select(this)
              .style("fill-opacity", 0.6)
              .style("stroke-width", "3px");

            tooltip.transition().duration(200).style("opacity", 1);
            let tooltipContent = `<strong style="color: #0f172a; font-size: 14px;">${d.name}</strong><br/>
                <span style="color: #64748b">Floor ${d.floor}</span><br/><hr style="border:none; border-top:1px solid #e2e8f0; margin: 4px 0;">`;
            if (d.csvData) {
                tooltipContent += `
                <span style="font-size: 12px"><b>Total Students:</b> ${d.csvData['Total num students']}</span><br/>
                <span style="font-size: 12px"><b>Groups:</b> ${d.csvData['Num groups']} (Avg size: ${d.csvData['Avg size of group']})</span><br/>
                <span style="font-size: 12px"><b>Activity:</b> ${d.csvData['Num studying']} studying, ${d.csvData['Num eating']} eating, ${d.csvData['Num talking']} talking</span><br/>
                <span style="font-size: 12px"><b>Food:</b> ${d.csvData['What ppl are eating']}</span><br/>
                <span style="font-size: 12px"><b>Empty Seats:</b> ${d.csvData['Num empty seats']}</span><br/>
                <span style="font-size: 12px"><b>Noise Level:</b> ${d.csvData['Decibel level (dBA)']} dBA</span>`;
            } else {
                tooltipContent += `<span style="font-family: monospace">Pos: (${d.x}, ${d.y})</span><br/>
                <span style="font-family: monospace">Size: ${d.w} x ${d.h}</span>`;
            }
            tooltip.html(tooltipContent)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 40) + "px");
        })
        .on("mouseout", function(d) {
            d3.select(this)
              .style("fill-opacity", 0.4)
              .style("stroke-width", "2px");

            tooltip.transition().duration(400).style("opacity", 0);
        })
        .on("click", (event, d) => {
            console.log("Clicked:", d);
        });

    rooms.append("text")
        .attr("class", "room-label")
        .attr("x", d => d.x + d.w / 2)
        .attr("y", d => d.y + d.h / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .text(d => d.name.length > 25 ? d.name.substring(0, 22) + "..." : d.name)
        // hide labels if box is too small
        .style("opacity", d => (d.w > 70 && d.h > 30) ? 1 : 0);
}

// Load data and draw maps for each floor
Promise.all([
    d3.json('room.json'),
    d3.csv('map_data.csv')
]).then(([roomData, mapData]) => {
    const dataMap = new Map(mapData.map(d => [+d.ID, d]));
    roomData.forEach(room => {
        room.csvData = dataMap.get(room.id);
    });

    drawFloorMap("#map-container-1", 1, roomData);
    drawFloorMap("#map-container-2", 2, roomData);
    drawFloorMap("#map-container-3", 3, roomData);
}).catch(error => {
    console.error("Error loading data:", error);
});