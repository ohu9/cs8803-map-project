// 1. Create a container that holds the image and the SVG
const container = d3.select("#map-container")
    .style("position", "relative");

// 2. Add your base image
container.append("img")
    .attr("src", "1st.png")
    .style("width", "100%");

// 3. Add an SVG overlay
const svg = container.append("svg")
    .attr("viewBox", "0 0 1000 1000") // Matches the 1000x1000 coordinate system
    .style("position", "absolute")
    .style("top", 0)
    .style("left", 0)
    .style("width", "100%");

// 4. Draw the rooms based on the JSON above
svg.selectAll("rect")
    .data(roomData)
    .enter()
    .append("rect")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .attr("width", d => d.w)
    .attr("height", d => d.h)
    .attr("fill", "rgba(255, 0, 0, 0.3)") // Semi-transparent overlay
    .on("click", (event, d) => {
        console.log("Stats for " + d.name + ": ", getMyStats(d.id));
    });