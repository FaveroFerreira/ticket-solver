import networkx as nx
from itertools import combinations
from data import ROUTES, CITIES, SCORING


def build_graph(blocked_edges=None):
    """Build a networkx MultiGraph from the route data.

    Uses MultiGraph because there can be parallel routes between cities.
    blocked_edges is a list of (city_a, city_b, route_index) to exclude.
    """
    G = nx.MultiGraph()

    for city, coords in CITIES.items():
        G.add_node(city, **coords)

    for i, (a, b, length, color, tunnel, ferry) in enumerate(ROUTES):
        if blocked_edges and (a, b, i) in blocked_edges:
            continue
        G.add_edge(a, b, key=i, weight=length, color=color,
                   tunnel=tunnel, ferry=ferry, route_index=i)

    return G


def _get_simple_graph(G):
    """Convert MultiGraph to simple Graph keeping minimum weight edges."""
    simple = nx.Graph()
    for city, data in G.nodes(data=True):
        simple.add_node(city, **data)

    for u, v, key, data in G.edges(keys=True, data=True):
        if simple.has_edge(u, v):
            if data["weight"] < simple[u][v]["weight"]:
                simple[u][v].update(data)
        else:
            simple.add_edge(u, v, **data)

    return simple


def solve_steiner_tree(G, terminal_cities):
    """Find the approximate minimum Steiner tree connecting all terminal cities.

    Uses networkx's built-in steiner_tree which implements the
    Kou-Markowsky-Berman approximation algorithm (2-approximation).
    """
    simple = _get_simple_graph(G)

    if len(terminal_cities) < 2:
        return {"edges": [], "total_cars": 0, "total_points": 0}

    # Ensure all terminals exist in the graph
    terminals = [c for c in terminal_cities if c in simple.nodes]
    if len(terminals) < 2:
        return {"edges": [], "total_cars": 0, "total_points": 0}

    try:
        tree = nx.approximation.steiner_tree(simple, terminals, weight="weight")
    except nx.NetworkXError:
        return {"edges": [], "total_cars": 0, "total_points": 0}

    edges = []
    total_cars = 0
    total_points = 0

    for u, v, data in tree.edges(data=True):
        length = data["weight"]
        points = SCORING.get(length, 0)
        edges.append({
            "from": u,
            "to": v,
            "length": length,
            "color": data.get("color", "gray"),
            "tunnel": data.get("tunnel", False),
            "ferry": data.get("ferry", 0),
            "points": points,
            "route_index": data.get("route_index", -1),
        })
        total_cars += length
        total_points += points

    return {
        "edges": edges,
        "total_cars": total_cars,
        "total_points": total_points,
    }


def solve_with_alternatives(G, terminal_cities, num_alternatives=2):
    """Find optimal route and alternatives by penalizing used edges."""
    results = []

    # Primary solution
    primary = solve_steiner_tree(G, terminal_cities)
    primary["label"] = "Rota Principal (Otima)"
    results.append(primary)

    if not primary["edges"]:
        return results

    # Generate alternatives by penalizing edges from previous solutions
    simple = _get_simple_graph(G)

    for alt_num in range(num_alternatives):
        penalized = simple.copy()

        # Penalize all edges from all previous solutions
        for prev in results:
            for edge in prev["edges"]:
                u, v = edge["from"], edge["to"]
                if penalized.has_edge(u, v):
                    penalized[u][v]["weight"] *= 3

        terminals = [c for c in terminal_cities if c in penalized.nodes]
        if len(terminals) < 2:
            break

        try:
            tree = nx.approximation.steiner_tree(
                penalized, terminals, weight="weight"
            )
        except nx.NetworkXError:
            break

        edges = []
        total_cars = 0
        total_points = 0

        for u, v, _ in tree.edges(data=True):
            # Get original edge data (not penalized weights)
            orig_data = simple[u][v]
            length = orig_data["weight"]
            points = SCORING.get(length, 0)
            edges.append({
                "from": u,
                "to": v,
                "length": length,
                "color": orig_data.get("color", "gray"),
                "tunnel": orig_data.get("tunnel", False),
                "ferry": orig_data.get("ferry", 0),
                "points": points,
                "route_index": orig_data.get("route_index", -1),
            })
            total_cars += length
            total_points += points

        alt = {
            "label": f"Rota Alternativa {alt_num + 1}",
            "edges": edges,
            "total_cars": total_cars,
            "total_points": total_points,
        }
        results.append(alt)

    return results


def get_terminal_cities(ticket_indices, tickets):
    """Extract unique terminal cities from selected tickets."""
    cities = set()
    for idx in ticket_indices:
        if 0 <= idx < len(tickets):
            cities.add(tickets[idx][0])
            cities.add(tickets[idx][1])
    return list(cities)
