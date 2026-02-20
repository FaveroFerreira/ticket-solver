from flask import Flask, render_template, jsonify, request
from data import CITIES, ROUTES, TICKETS, SCORING
from solver import build_graph, solve_with_alternatives, get_terminal_cities

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/data")
def get_data():
    """Return all game data for the frontend."""
    tickets = []
    for i, (a, b, pts, is_long) in enumerate(TICKETS):
        tickets.append({
            "index": i,
            "from": a,
            "to": b,
            "points": pts,
            "is_long": is_long,
        })

    routes = []
    for i, (a, b, length, color, tunnel, ferry) in enumerate(ROUTES):
        routes.append({
            "index": i,
            "from": a,
            "to": b,
            "length": length,
            "color": color,
            "tunnel": tunnel,
            "ferry": ferry,
        })

    return jsonify({
        "cities": CITIES,
        "tickets": tickets,
        "routes": routes,
        "scoring": SCORING,
    })


@app.route("/api/solve", methods=["POST"])
def solve():
    """Solve for optimal routes given selected tickets and blocked routes."""
    body = request.get_json()
    ticket_indices = body.get("tickets", [])
    blocked = body.get("blocked", [])
    num_alternatives = body.get("num_alternatives", 2)

    # Build blocked edges set
    blocked_edges = set()
    for b in blocked:
        blocked_edges.add((b["from"], b["to"], b["route_index"]))

    G = build_graph(blocked_edges if blocked_edges else None)
    terminals = get_terminal_cities(ticket_indices, TICKETS)

    results = solve_with_alternatives(G, terminals, num_alternatives)

    # Include selected ticket info in response
    selected_tickets = []
    for idx in ticket_indices:
        if 0 <= idx < len(TICKETS):
            a, b, pts, is_long = TICKETS[idx]
            selected_tickets.append({
                "from": a, "to": b, "points": pts, "is_long": is_long
            })

    return jsonify({
        "terminals": terminals,
        "selected_tickets": selected_tickets,
        "solutions": results,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
