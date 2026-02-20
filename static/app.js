let gameData = null;
let selectedTickets = new Set();
let blockedRoutes = [];
let currentSolutions = null;
let activeSolutionIndex = 0;
let calibrationMode = false;
let calibrationCities = [];
let calibrationIndex = 0;
let calibrationData = {};

const SOLUTION_COLORS = ["#00ff88", "#ffaa00", "#00bbff"];
const NS = "http://www.w3.org/2000/svg";

async function init() {
    const res = await fetch("/api/data");
    gameData = await res.json();

    const img = document.getElementById("map-img");
    if (img.complete) {
        onImageReady();
    } else {
        img.addEventListener("load", onImageReady);
    }
}

function onImageReady() {
    setupSvgOverlays();
    renderTickets();
    renderMapRoutes();

    window.addEventListener("resize", () => {
        setupSvgOverlays();
        if (!calibrationMode) renderMapRoutes();
        if (currentSolutions) drawSolutionOnMap(activeSolutionIndex);
    });
}

function setupSvgOverlays() {
    const img = document.getElementById("map-img");
    const overlay = document.getElementById("map-overlay");
    const routeOverlay = document.getElementById("route-overlay");

    const vb = `0 0 ${img.naturalWidth} ${img.naturalHeight}`;

    [overlay, routeOverlay].forEach(svg => {
        svg.setAttribute("viewBox", vb);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.style.width = img.clientWidth + "px";
        svg.style.height = img.clientHeight + "px";
        svg.style.position = "absolute";
        svg.style.top = img.offsetTop + "px";
        svg.style.left = img.offsetLeft + "px";
    });
}

// --- Calibration Mode ---

function startCalibration() {
    calibrationMode = true;
    calibrationCities = Object.keys(gameData.cities);
    calibrationIndex = 0;
    calibrationData = {};

    // Hide normal UI, show calibration UI
    document.getElementById("ticket-selection").classList.add("hidden");
    document.getElementById("actions").classList.add("hidden");
    document.getElementById("results").classList.add("hidden");
    document.getElementById("blocked-section").classList.add("hidden");

    const calDiv = document.getElementById("calibration-ui");
    calDiv.classList.remove("hidden");

    // Clear map overlay
    document.getElementById("map-overlay").innerHTML = "";
    document.getElementById("route-overlay").innerHTML = "";

    // Set up click handler on overlay
    const svg = document.getElementById("map-overlay");
    svg._calHandler = (e) => {
        if (!calibrationMode) return;
        const img = document.getElementById("map-img");
        const rect = img.getBoundingClientRect();
        const scaleX = img.naturalWidth / rect.width;
        const scaleY = img.naturalHeight / rect.height;
        const px = Math.round((e.clientX - rect.left) * scaleX);
        const py = Math.round((e.clientY - rect.top) * scaleY);

        const cityName = calibrationCities[calibrationIndex];
        calibrationData[cityName] = { x: px, y: py };

        // Draw dot where clicked
        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", px);
        circle.setAttribute("cy", py);
        circle.setAttribute("r", "6");
        circle.setAttribute("fill", "#00ff88");
        circle.setAttribute("stroke", "white");
        circle.setAttribute("stroke-width", "2");
        svg.appendChild(circle);

        const label = document.createElementNS(NS, "text");
        label.setAttribute("x", px);
        label.setAttribute("y", py - 10);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("fill", "#00ff88");
        label.setAttribute("font-size", "9");
        label.setAttribute("font-weight", "bold");
        label.setAttribute("paint-order", "stroke");
        label.setAttribute("stroke", "rgba(0,0,0,0.8)");
        label.setAttribute("stroke-width", "3");
        label.textContent = cityName;
        svg.appendChild(label);

        calibrationIndex++;
        updateCalibrationUI();
    };
    svg.addEventListener("click", svg._calHandler);

    updateCalibrationUI();
}

function undoCalibration() {
    if (calibrationIndex <= 0) return;
    calibrationIndex--;
    const cityName = calibrationCities[calibrationIndex];
    delete calibrationData[cityName];

    // Remove last 2 SVG elements (circle + label)
    const svg = document.getElementById("map-overlay");
    if (svg.lastChild) svg.removeChild(svg.lastChild);
    if (svg.lastChild) svg.removeChild(svg.lastChild);

    updateCalibrationUI();
}

function updateCalibrationUI() {
    const calDiv = document.getElementById("calibration-ui");
    const total = calibrationCities.length;

    if (calibrationIndex >= total) {
        // Done! Show results
        let output = "CITIES = {\n";
        for (const [name, coords] of Object.entries(calibrationData)) {
            const pad = " ".repeat(20 - name.length - 2);
            output += `    "${name}":${pad}{"x": ${coords.x},${coords.x < 100 ? "  " : coords.x < 1000 ? " " : ""} "y": ${coords.y}},\n`;
        }
        output += "}";

        calDiv.innerHTML = `
            <h2>Calibracao Completa!</h2>
            <p>${total} cidades calibradas</p>
            <textarea id="cal-output" style="width:100%;height:300px;background:#1a1a2e;color:#0f0;border:1px solid #0f3460;font-family:monospace;font-size:11px;padding:8px;">${output}</textarea>
            <button onclick="copyCalibration()" style="margin-top:8px;padding:8px;background:#00ff88;color:#000;border:none;border-radius:6px;cursor:pointer;width:100%;">Copiar para Clipboard</button>
            <button onclick="endCalibration()" style="margin-top:8px;padding:8px;background:#e94560;color:#fff;border:none;border-radius:6px;cursor:pointer;width:100%;">Voltar</button>
        `;
        return;
    }

    const cityName = calibrationCities[calibrationIndex];
    calDiv.innerHTML = `
        <h2>Calibracao</h2>
        <p style="font-size:0.85rem;color:#a8b2d1;">Clique na cidade no mapa:</p>
        <div style="font-size:1.5rem;color:#00ff88;font-weight:bold;text-align:center;padding:12px 0;">${cityName}</div>
        <p style="font-size:0.8rem;color:#666;">${calibrationIndex + 1} / ${total}</p>
        <div style="background:#1a1a2e;border-radius:4px;height:6px;margin:8px 0;">
            <div style="background:#00ff88;height:100%;border-radius:4px;width:${(calibrationIndex / total * 100)}%;"></div>
        </div>
        <button onclick="undoCalibration()" style="padding:6px 12px;background:#0f3460;color:#a8b2d1;border:none;border-radius:6px;cursor:pointer;margin-top:4px;"${calibrationIndex === 0 ? " disabled" : ""}>Desfazer ultimo</button>
        <button onclick="endCalibration()" style="padding:6px 12px;background:#e94560;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-top:4px;float:right;">Cancelar</button>
    `;
}

function copyCalibration() {
    const textarea = document.getElementById("cal-output");
    textarea.select();
    navigator.clipboard.writeText(textarea.value);
}

function endCalibration() {
    calibrationMode = false;
    const svg = document.getElementById("map-overlay");
    if (svg._calHandler) {
        svg.removeEventListener("click", svg._calHandler);
        svg._calHandler = null;
    }

    document.getElementById("calibration-ui").classList.add("hidden");
    document.getElementById("ticket-selection").classList.remove("hidden");
    document.getElementById("actions").classList.remove("hidden");
    document.getElementById("blocked-section").classList.remove("hidden");

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

        const line = document.createElementNS(NS, "line");
        line.setAttribute("x1", from.x);
        line.setAttribute("y1", from.y);
        line.setAttribute("x2", to.x);
        line.setAttribute("y2", to.y);
        line.setAttribute("stroke", "transparent");
        line.setAttribute("stroke-width", "14");
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

    // Draw city dots and labels
    Object.entries(gameData.cities).forEach(([name, coords]) => {
        const g = document.createElementNS(NS, "g");

        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", coords.x);
        circle.setAttribute("cy", coords.y);
        circle.setAttribute("r", "8");
        circle.setAttribute("fill", "#0f3460");
        circle.setAttribute("stroke", "#a8b2d1");
        circle.setAttribute("stroke-width", "2");
        circle.classList.add("city-dot");
        circle.dataset.city = name;
        g.appendChild(circle);

        const label = document.createElementNS(NS, "text");
        label.setAttribute("x", coords.x);
        label.setAttribute("y", coords.y - 12);
        label.setAttribute("text-anchor", "middle");
        label.classList.add("city-label");
        label.textContent = name;
        g.appendChild(label);

        svg.appendChild(g);
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
        const glow = document.createElementNS(NS, "line");
        glow.setAttribute("x1", from.x);
        glow.setAttribute("y1", from.y);
        glow.setAttribute("x2", to.x);
        glow.setAttribute("y2", to.y);
        glow.setAttribute("stroke", color);
        glow.setAttribute("stroke-width", "18");
        glow.setAttribute("stroke-opacity", "0.3");
        glow.setAttribute("stroke-linecap", "round");
        glow.classList.add("solution-edge");
        svg.appendChild(glow);

        // Main line
        const line = document.createElementNS(NS, "line");
        line.setAttribute("x1", from.x);
        line.setAttribute("y1", from.y);
        line.setAttribute("x2", to.x);
        line.setAttribute("y2", to.y);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "6");
        line.setAttribute("stroke-linecap", "round");
        line.classList.add("solution-edge");
        svg.appendChild(line);
    });

    // Highlight terminal cities
    currentSolutions.terminals.forEach((city) => {
        const coords = gameData.cities[city];
        if (!coords) return;

        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", coords.x);
        circle.setAttribute("cy", coords.y);
        circle.setAttribute("r", "14");
        circle.setAttribute("fill", color);
        circle.setAttribute("fill-opacity", "0.8");
        circle.setAttribute("stroke", "white");
        circle.setAttribute("stroke-width", "3");
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
