let gameData = null;
let selectedTickets = new Set();
let blockedRoutes = [];
let currentSolutions = null;
let activeSolutionIndex = 0;

const SOLUTION_COLORS = ["#00ff88", "#ffaa00", "#00bbff"];

async function init() {
    const res = await fetch("/api/data");
    gameData = await res.json();
    renderTickets();
    renderMapRoutes();
}

// --- Ticket Selection ---

function renderTickets() {
    const longDiv = document.getElementById("long-tickets");
    const shortDiv = document.getElementById("short-tickets");
    longDiv.innerHTML = "";
    shortDiv.innerHTML = "";

    gameData.tickets.forEach((t) => {
        const el = document.createElement("div");
        el.className = `ticket-item${t.is_long ? " long-route" : ""}`;
        el.dataset.index = t.index;
        el.innerHTML = `
            <span class="cities">${t.from}</span>
            <span class="arrow">\u2192</span>
            <span class="cities">${t.to}</span>
            <span class="points">${t.points}</span>
        `;
        el.addEventListener("click", () => toggleTicket(t.index, el));

        if (t.is_long) {
            longDiv.appendChild(el);
        } else {
            shortDiv.appendChild(el);
        }
    });
}

function toggleTicket(index, el) {
    if (selectedTickets.has(index)) {
        selectedTickets.delete(index);
        el.classList.remove("selected");
    } else {
        selectedTickets.add(index);
        el.classList.add("selected");
    }
    updateTerminalHighlights();
}

function updateTerminalHighlights() {
    const terminals = new Set();
    selectedTickets.forEach((idx) => {
        const t = gameData.tickets[idx];
        terminals.add(t.from);
        terminals.add(t.to);
    });

    document.querySelectorAll(".city-dot").forEach((dot) => {
        if (terminals.has(dot.dataset.city)) {
            dot.classList.add("terminal");
        } else {
            dot.classList.remove("terminal");
        }
    });
}

// --- Map Rendering ---

function renderMapRoutes() {
    const svg = document.getElementById("map-overlay");
    svg.innerHTML = "";

    // Draw route lines (clickable for blocking)
    gameData.routes.forEach((route) => {
        const from = gameData.cities[route.from];
        const to = gameData.cities[route.to];
        if (!from || !to) return;

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", from.x);
        line.setAttribute("y1", from.y);
        line.setAttribute("x2", to.x);
        line.setAttribute("y2", to.y);
        line.setAttribute("stroke", "transparent");
        line.setAttribute("stroke-width", "1.2");
        line.classList.add("route-line");
        line.dataset.routeIndex = route.index;
        line.dataset.from = route.from;
        line.dataset.to = route.to;

        line.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleBlockRoute(route, line);
        });

        svg.appendChild(line);
    });

    // Draw city dots
    Object.entries(gameData.cities).forEach(([name, coords]) => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", coords.x);
        circle.setAttribute("cy", coords.y);
        circle.setAttribute("r", "0.7");
        circle.setAttribute("fill", "#0f3460");
        circle.setAttribute("stroke", "#a8b2d1");
        circle.setAttribute("stroke-width", "0.15");
        circle.classList.add("city-dot");
        circle.dataset.city = name;

        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = name;
        circle.appendChild(title);

        svg.appendChild(circle);
    });
}

// --- Route Blocking ---

function toggleBlockRoute(route, lineEl) {
    const idx = blockedRoutes.findIndex(
        (b) => b.route_index === route.index
    );

    if (idx >= 0) {
        blockedRoutes.splice(idx, 1);
        lineEl.classList.remove("blocked");
        lineEl.setAttribute("stroke", "transparent");
    } else {
        blockedRoutes.push({
            from: route.from,
            to: route.to,
            route_index: route.index,
        });
        lineEl.classList.add("blocked");
        lineEl.setAttribute("stroke", "#ff4444");
    }

    renderBlockedList();
}

function renderBlockedList() {
    const div = document.getElementById("blocked-list");
    div.innerHTML = "";
    blockedRoutes.forEach((b, i) => {
        const el = document.createElement("div");
        el.className = "blocked-item";
        el.innerHTML = `
            <span>${b.from} \u2194 ${b.to}</span>
            <button class="remove-btn" onclick="removeBlocked(${i})">\u2715</button>
        `;
        div.appendChild(el);
    });
}

function removeBlocked(index) {
    const b = blockedRoutes[index];
    const line = document.querySelector(
        `.route-line[data-route-index="${b.route_index}"]`
    );
    if (line) {
        line.classList.remove("blocked");
        line.setAttribute("stroke", "transparent");
    }
    blockedRoutes.splice(index, 1);
    renderBlockedList();
}

// --- Solving ---

async function solvePuzzle() {
    if (selectedTickets.size === 0) {
        alert("Selecione pelo menos um ticket de destino!");
        return;
    }

    const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            tickets: Array.from(selectedTickets),
            blocked: blockedRoutes,
            num_alternatives: 2,
        }),
    });

    currentSolutions = await res.json();
    activeSolutionIndex = 0;
    showResults();
}

function showResults() {
    const resultsDiv = document.getElementById("results");
    resultsDiv.classList.remove("hidden");

    renderSolutionTabs();
    renderSolutionDetails(activeSolutionIndex);
    drawSolutionOnMap(activeSolutionIndex);
}

function renderSolutionTabs() {
    const tabsDiv = document.getElementById("solution-tabs");
    tabsDiv.innerHTML = "";

    currentSolutions.solutions.forEach((sol, i) => {
        const btn = document.createElement("button");
        btn.className = `sol-tab${i === activeSolutionIndex ? " active" : ""}`;
        btn.textContent = sol.label;
        btn.addEventListener("click", () => {
            activeSolutionIndex = i;
            renderSolutionTabs();
            renderSolutionDetails(i);
            drawSolutionOnMap(i);
        });
        tabsDiv.appendChild(btn);
    });
}

function renderSolutionDetails(index) {
    const sol = currentSolutions.solutions[index];
    const div = document.getElementById("solution-details");

    const ticketPoints = currentSolutions.selected_tickets.reduce(
        (sum, t) => sum + t.points, 0
    );

    div.innerHTML = `
        <div class="sol-summary">
            <div class="sol-stat">
                <div class="value">${sol.total_cars}</div>
                <div class="label">Vag\u00f5es</div>
            </div>
            <div class="sol-stat">
                <div class="value">${sol.total_points}</div>
                <div class="label">Pts Rotas</div>
            </div>
            <div class="sol-stat">
                <div class="value">${ticketPoints}</div>
                <div class="label">Pts Tickets</div>
            </div>
            <div class="sol-stat">
                <div class="value">${sol.total_points + ticketPoints}</div>
                <div class="label">Total</div>
            </div>
        </div>
        <div class="edge-list">
            ${sol.edges
                .sort((a, b) => b.length - a.length)
                .map((e) => `
                    <div class="edge-item">
                        <div class="edge-color" style="background:${getColorHex(e.color)}"></div>
                        <span class="edge-cities">${e.from} \u2192 ${e.to}</span>
                        <span class="edge-info">${e.length} vag. | ${e.points} pts${e.tunnel ? " | T\u00fanel" : ""}${e.ferry > 0 ? ` | Ferry(${e.ferry})` : ""}</span>
                    </div>
                `).join("")}
        </div>
    `;
}

function drawSolutionOnMap(index) {
    const svg = document.getElementById("route-overlay");
    svg.innerHTML = "";

    const sol = currentSolutions.solutions[index];
    const color = SOLUTION_COLORS[index] || SOLUTION_COLORS[0];

    sol.edges.forEach((edge) => {
        const from = gameData.cities[edge.from];
        const to = gameData.cities[edge.to];
        if (!from || !to) return;

        // Glow effect
        const glow = document.createElementNS("http://www.w3.org/2000/svg", "line");
        glow.setAttribute("x1", from.x);
        glow.setAttribute("y1", from.y);
        glow.setAttribute("x2", to.x);
        glow.setAttribute("y2", to.y);
        glow.setAttribute("stroke", color);
        glow.setAttribute("stroke-width", "1.5");
        glow.setAttribute("stroke-opacity", "0.3");
        glow.setAttribute("stroke-linecap", "round");
        glow.classList.add("solution-edge");
        svg.appendChild(glow);

        // Main line
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", from.x);
        line.setAttribute("y1", from.y);
        line.setAttribute("x2", to.x);
        line.setAttribute("y2", to.y);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "0.7");
        line.setAttribute("stroke-linecap", "round");
        line.classList.add("solution-edge");
        svg.appendChild(line);
    });

    // Highlight terminal cities
    currentSolutions.terminals.forEach((city) => {
        const coords = gameData.cities[city];
        if (!coords) return;

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", coords.x);
        circle.setAttribute("cy", coords.y);
        circle.setAttribute("r", "1.2");
        circle.setAttribute("fill", color);
        circle.setAttribute("fill-opacity", "0.8");
        circle.setAttribute("stroke", "white");
        circle.setAttribute("stroke-width", "0.25");
        svg.appendChild(circle);
    });
}

function getColorHex(color) {
    const map = {
        red: "#e74c3c",
        blue: "#3498db",
        green: "#2ecc71",
        yellow: "#f1c40f",
        black: "#2c3e50",
        white: "#ecf0f1",
        orange: "#e67e22",
        pink: "#e91e8a",
        gray: "#95a5a6",
    };
    return map[color] || "#95a5a6";
}

// --- Clear ---

function clearAll() {
    selectedTickets.clear();
    blockedRoutes = [];
    currentSolutions = null;
    activeSolutionIndex = 0;

    document.querySelectorAll(".ticket-item.selected").forEach((el) => {
        el.classList.remove("selected");
    });
    document.querySelectorAll(".city-dot.terminal").forEach((el) => {
        el.classList.remove("terminal");
    });
    document.querySelectorAll(".route-line.blocked").forEach((el) => {
        el.classList.remove("blocked");
        el.setAttribute("stroke", "transparent");
    });

    document.getElementById("results").classList.add("hidden");
    document.getElementById("blocked-list").innerHTML = "";
    document.getElementById("route-overlay").innerHTML = "";
}

// --- Init ---
document.addEventListener("DOMContentLoaded", init);
