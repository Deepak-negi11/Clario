// Everything that can stand on a map: the furniture Clario HQ uses, plus outdoor pieces and
// buildings for maps people build themselves. The 2D map, the 3D view, the map builder and the
// server all read sizes from here, so they agree on what blocks a tile and what you can sit on.

export type Dir = "up" | "down" | "left" | "right";
export const DIRS = ["up", "down", "left", "right"] as const satisfies readonly Dir[];

export const FLOOR_KINDS = [
  "wood", "carpet", "tile", "herringbone", "terrazzo", "sage", "arcade", "sand", "office",
  "raised", "concrete", "teal", "zigzag", "porcelain", "brick", "lavender", "maple", "crosstile", "damask",
] as const;
export type FloorKind = (typeof FLOOR_KINDS)[number];

export const FABRICS = ["navy", "coral", "teal", "mustard", "sage", "grey", "blue", "purple", "pink", "white", "leather"] as const;
export type Fabric = (typeof FABRICS)[number];

export type ItemCategory = "Office" | "Meetings" | "Lounge" | "Kitchen" | "Fun" | "Tech" | "Decor" | "Outdoor" | "Buildings";

// w/h: the tiles the item stands on (the same whichever way it faces). Seats are walkable and
// let you sit; everything else blocks. `faces`: the directions it can be turned to (the 2D map
// only has side views for some seats). `fabric`: it can be upholstered in one of FABRICS.
export type ItemSpec = { w: number; h: number; label: string; category: ItemCategory; seat?: boolean; faces?: readonly Dir[]; fabric?: boolean };

const ALL_WAYS = DIRS;
const FRONT_BACK = ["down", "up"] as const;

const SPECS = {
  "desk-l": { w: 2, h: 1, label: "Desk (screen left)", category: "Office" },
  "desk-r": { w: 2, h: 1, label: "Desk (screen right)", category: "Office" },
  "task-chair": { w: 1, h: 1, label: "Office chair", category: "Office", seat: true, faces: ALL_WAYS },
  "desk-white": { w: 2, h: 1, label: "White desk", category: "Office" },
  bookshelf: { w: 2, h: 1, label: "Bookshelf", category: "Office" },
  "filing-cabinet": { w: 1, h: 1, label: "Filing cabinet", category: "Office" },
  "water-cooler": { w: 1, h: 1, label: "Water cooler", category: "Office" },
  "exec-chair": { w: 1, h: 1, label: "Executive chair", category: "Office", seat: true, faces: ALL_WAYS, fabric: true },
  wardrobe: { w: 1, h: 1, label: "Wardrobe", category: "Office" },
  "coat-rack": { w: 1, h: 1, label: "Coat rack", category: "Office" },
  "reception-desk": { w: 4, h: 2, label: "Reception desk", category: "Office" },
  "meeting-table": { w: 6, h: 2, label: "Meeting table (12)", category: "Meetings" },
  "meeting-table-sm": { w: 4, h: 2, label: "Meeting table (8)", category: "Meetings" },
  "meeting-table-md": { w: 3, h: 2, label: "Meeting table (6 + ends)", category: "Meetings" },
  "meet-chair": { w: 1, h: 1, label: "Meeting chair", category: "Meetings", seat: true, faces: ALL_WAYS, fabric: true },
  whiteboard: { w: 2, h: 1, label: "Whiteboard", category: "Meetings" },
  "flip-chart": { w: 1, h: 1, label: "Flip chart", category: "Meetings" },
  podium: { w: 1, h: 1, label: "Podium", category: "Meetings" },
  "theatre-seat": { w: 1, h: 1, label: "Theatre seat", category: "Meetings", seat: true, faces: FRONT_BACK },
  sofa: { w: 3, h: 1, label: "Sofa", category: "Lounge", seat: true, faces: FRONT_BACK, fabric: true },
  armchair: { w: 1, h: 1, label: "Armchair", category: "Lounge", seat: true, faces: ALL_WAYS, fabric: true },
  beanbag: { w: 1, h: 1, label: "Beanbag", category: "Lounge", seat: true, fabric: true },
  "coffee-table": { w: 3, h: 1, label: "Coffee table", category: "Lounge" },
  "side-table": { w: 1, h: 1, label: "Side table", category: "Lounge" },
  "cube-shelf": { w: 2, h: 1, label: "Cube shelf", category: "Lounge" },
  "tv-console": { w: 3, h: 1, label: "TV", category: "Lounge" },
  "floor-lamp": { w: 1, h: 1, label: "Floor lamp", category: "Lounge" },
  fridge: { w: 1, h: 1, label: "Fridge", category: "Kitchen" },
  counter: { w: 1, h: 1, label: "Counter", category: "Kitchen" },
  "counter-sink": { w: 1, h: 1, label: "Sink", category: "Kitchen" },
  "counter-micro": { w: 1, h: 1, label: "Microwave", category: "Kitchen" },
  "counter-coffee": { w: 1, h: 1, label: "Coffee machine", category: "Kitchen" },
  "cafe-table": { w: 2, h: 1, label: "Cafe table", category: "Kitchen" },
  "cafe-chair": { w: 1, h: 1, label: "Cafe chair", category: "Kitchen", seat: true, faces: ALL_WAYS },
  "round-table": { w: 1, h: 1, label: "Round cafe table", category: "Kitchen" },
  "coffee-bar": { w: 2, h: 1, label: "Coffee station", category: "Kitchen" },
  "vending-machine": { w: 1, h: 1, label: "Vending machine", category: "Kitchen" },
  pingpong: { w: 3, h: 2, label: "Ping-pong table", category: "Fun" },
  arcade: { w: 1, h: 1, label: "Arcade machine", category: "Fun" },
  foosball: { w: 2, h: 1, label: "Foosball", category: "Fun" },
  "server-rack": { w: 1, h: 1, label: "Server rack", category: "Tech" },
  "printer-3d": { w: 1, h: 1, label: "3D printer", category: "Tech" },
  "robot-arm": { w: 1, h: 1, label: "Robot arm", category: "Tech" },
  workbench: { w: 2, h: 1, label: "Electronics bench", category: "Tech" },
  "vr-station": { w: 1, h: 1, label: "VR station", category: "Tech" },
  "plant-big": { w: 1, h: 1, label: "Plant", category: "Decor" },
  "plant-small": { w: 1, h: 1, label: "Small plant", category: "Decor" },
  "plant-tree": { w: 1, h: 1, label: "Indoor tree", category: "Decor" },
  globe: { w: 1, h: 1, label: "Globe", category: "Decor" },
  aquarium: { w: 2, h: 1, label: "Aquarium", category: "Decor" },
  "traffic-cone": { w: 1, h: 1, label: "Traffic cone", category: "Decor" },
  tree: { w: 2, h: 1, label: "Tree", category: "Outdoor" },
  bush: { w: 1, h: 1, label: "Bush", category: "Outdoor" },
  bench: { w: 2, h: 1, label: "Park bench", category: "Outdoor", seat: true },
  "lamp-post": { w: 1, h: 1, label: "Street lamp", category: "Outdoor" },
  "bike-rack": { w: 2, h: 1, label: "Bike rack", category: "Outdoor" },
  fountain: { w: 3, h: 3, label: "Fountain", category: "Outdoor" },
  house: { w: 5, h: 4, label: "House", category: "Buildings" },
  shop: { w: 5, h: 4, label: "Shop", category: "Buildings" },
  cafe: { w: 5, h: 4, label: "Cafe", category: "Buildings" },
  "office-block": { w: 6, h: 5, label: "Office block", category: "Buildings" },
} as const satisfies Record<string, ItemSpec>;

export type ItemKind = keyof typeof SPECS;
export const ITEM_SPECS: Record<ItemKind, ItemSpec> = SPECS;
export const ITEM_KINDS = Object.keys(ITEM_SPECS) as ItemKind[];

export function itemSpec(kind: ItemKind): ItemSpec {
  return ITEM_SPECS[kind];
}

// Tiles an item covers: w x h from its top-left tile.
export function itemFootprint(item: { kind: ItemKind; x: number; y: number }) {
  const spec = itemSpec(item.kind);
  const cells: { x: number; y: number }[] = [];
  for (let dx = 0; dx < spec.w; dx++) for (let dy = 0; dy < spec.h; dy++) cells.push({ x: item.x + dx, y: item.y + dy });
  return cells;
}
