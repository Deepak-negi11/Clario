# Office refinements — 2026-11-02

## Visuals and map actions

The existing Three.js/WebGL renderer now uses smaller translucent context controls instead of a full-width cream action bar. Book selection expands on request. Call rings and destination markers are thinner and translucent. Laptops sit close enough to desk chairs for the IK typing pose to reach the keyboard. Seated name tags follow seated head height. Room labels are smaller, fade inside the current room, and disappear when they overlap names. The main office clock uses Three.js Timer and document visibility handling.

## Printer

Office printer is a new builder item, with matching 2D artwork and a rounded 3D copier/scanner on a wheeled cabinet. Each built-in template has one, and newly generated team offices include one. Existing saved custom layouts can place it from the builder's Office category.

Stand beside it and use E or the Print button. Edit notes or choose a local plain-text, PNG, JPEG or WebP file (8 MB cap). The print document is React-escaped, has its own print stylesheet and contains no map/UI. Files stay in browser memory and are not sent to the backend. Local image object URLs are revoked on replacement or component unmount. HTML/SVG and unlisted formats are rejected.

“Choose printer & print” calls window.print(). The user selects a printer already installed on their computer or saves a PDF. This does not discover network printers, install drivers, silently print, or confirm hardware job success. The UI explains that closing a print dialog is not proof of printing. No physical printer job was sent during verification.

## Five-person meeting

The call dock automatically uses a two-column gallery with three or more participants. All five people fit into three rows. Participants can be enlarged, the gallery switched to a strip, or the call minimized. Camera-off placeholders remain readable. Existing single-audio playback and muted spotlight behavior are retained.

Meeting/conference rooms keep everyone in the room connected, including seats beyond the ordinary six-tile radius. Separate rooms and hallways do not connect through proximity. Ordinary rooms/open areas retain the six-tile rule. This changes which peers the client connects to; it is not a server authorization boundary.

Verification includes a five-participant visual simulation with four synthetic camera-off teammates, room membership/proximity tests and all 20 directed signaling paths between five real backend WebSocket connections. A five-device camera/microphone call and real-world TURN/NAT conditions were not tested.

## Quests

The quest panel has a recommendation, Discover/Completed filters, clearer rewards and expandable routes/badges. Its active HUD moves to the lower-left to avoid the gallery. “Walk there” follows the real map path, taking a reader to a shelf and someone without a drink to the vending machine first.

Two quests use real actions: turn a page in the Library, or sip in the Lounge, then return to Open Desks and choose a useful team message. Merely entering the room cannot complete an action step. The hook updates refs synchronously to prevent repeated rewards. Completed progress remains browser-local.

## Validation

566 tests pass across 53 files, including five-user signaling, room boundaries, printer file restrictions, quest action rules and saved map validity. Browser verification covered the five-avatar meeting/gallery, participant spotlight and minimizing/restoring the call, the compact bicycle prompt, 2D/3D printer entry and document editing/preview. The reading quest was completed through the live map (pickup, actual page turn, return to desks, weaker reply feedback, then one reward). Quest choices and printer editing coordinate their overlays so map controls and the book card stay behind the active task.

Final root type checks, lint (zero warnings), production build and diff checks passed. Frontend returned HTTP 200, backend health returned ok and Redis returned PONG. Temporary review routes were removed.
