"use client";

import { useEffect, useMemo, useRef } from "react";
import { floorAt, generateTeamOffice, isWallAt, itemFootprint, itemSpec, teamOfficePlan, type CustomMapItem } from "@repo/shared";
import { FLOOR_COLORS } from "../lib/maps/floor-colors";

// A small top-down drawing of the office the server will build for this many people, so the
// create-space dialog can show it growing as the team size changes.

const GRASS = "#9fd48a";
const PATH = "#cfc9bd";
const WALL = "#4a4f5e";
const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

function itemColor(item: CustomMapItem) {
  if (item.kind === "tree" || item.kind === "bush" || item.kind.startsWith("plant")) return "#3f8a4a";
  if (item.kind === "task-chair") return "#2f333c";
  if (item.kind === "desk-white") return "#f6f7fa";
  if (itemSpec(item.kind).seat) return item.fabric === "leather" ? "#ad6f46" : item.fabric === "sage" ? "#8ca57b" : "#5f92e2";
  if (item.kind.includes("table") || item.kind === "coffee-bar" || item.kind === "bookshelf" || item.kind === "cube-shelf") return "#b98451";
  return "#6c7282";
}

export function TeamOfficePreview({ teamSize, className }: { teamSize: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const map = useMemo(() => generateTeamOffice(teamSize), [teamSize]);
  const plan = useMemo(() => teamOfficePlan(teamSize), [teamSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const tile = 6;
    canvas.width = map.cols * tile;
    canvas.height = map.rows * tile;
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const floor = floorAt(map, x, y);
        ctx.fillStyle = isWallAt(map, x, y) ? WALL : !floor ? GRASS : floor === "path" ? PATH : hex(FLOOR_COLORS[floor]);
        ctx.fillRect(x * tile, y * tile, tile, tile);
      }
    }
    for (const item of map.items) {
      ctx.fillStyle = itemColor(item);
      for (const { x, y } of itemFootprint(item)) ctx.fillRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
    }
  }, [map]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Floor plan for ${plan.people} people: ${plan.desks} desks, ${plan.workrooms} workroom${plan.workrooms > 1 ? "s" : ""}, a lounge and a coffee corner`}
      className={`[image-rendering:pixelated] ${className ?? ""}`}
    />
  );
}
