# Office microinteractions

The live scene now publishes contextual actions in both 2D and WebGL. Approach a bookshelf or low cube shelf, the first vending machine, or the rideable bicycle rack. A small panel offers the action with focusable buttons; E performs the primary action and Q puts down the held prop. Keyboard repeats and typing in panels are ignored.

- Library: choose one of three original short books, carry it while walking, sit and read, move between four pages, and return it. Other people see the held book and page changes; late joiners receive the current page. The 3D book has cloth covers, page blocks, printed text, a ribbon and a turning leaf. Character hands follow the book, with a small page-turn gesture and downward gaze.
- Drinks: dispense a can, collect it from the tray, then take three sips. Each sip raises, pauses and lowers smoothly over 1.7 seconds. Actions wait for the animation before another sip. An empty can can be put away.
- Cycling: use the existing pedalling, steering and stop pose, with softer mount/dismount blends and fading bicycle geometry.
- Motion: frame-rate-independent pose blending; reduced-motion preferences suppress decorative page turns and panel travel. Native controls stay usable by touch and keyboard.

Classic Office and Coworking Campus now initialize the same live prop controls as Clario HQ and custom/team maps. Only an enum book identifier and bounded integer page travel through the socket; text comes from the shared local catalog.

Validation (2026-11-02): 558 tests passed, including book sharing/late joins/returning and invalid-page rejection. Root type checks, lint and production build passed. Browser checks used the actual Phaser scene, WebGL renderer and action panel with a local in-memory socket substitute, covering reading standing and seated, next/previous page, E shortcut, returning, vending pickup, repeated sips and an empty can. Reading was also checked at reachable shelves in Classic Office, Coworking Campus and Clario HQ. Cycling mount, movement and dismount were checked in WebGL, and the book artwork/action panel in 2D. Full socket behavior was exercised separately against the backend, Redis and database.
