# Aircraft Battle Engine

This folder contains the dedicated Aircraft authoritative battle engine.

It is intentionally separate from the existing `battle/` JavaScript engine, old card database, Godot battle field, and server integration.

Current entry points:

- `aircraft_state.js` creates initial Aircraft battle states.
- `aircraft_engine.js` applies Aircraft-only actions.
- `aircraft_serializer.js` normalizes the state schema used by Godot.
- `aircraft_server_adapter.js` exposes small adapter helpers for future server integration.
