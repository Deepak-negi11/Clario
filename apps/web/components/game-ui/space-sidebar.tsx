"use client";

import { ClipboardList, Gamepad2, Hammer, LogOut, Mail, Trophy, Users } from "lucide-react";

// Chat is opened from its own button in the bottom-left corner, not from this rail,
// but it still shares this state so only one panel is open at a time.
export type SidePanel = "people" | "chat" | "email" | "tasks" | "errands" | "builder";

type SpaceSidebarProps = {
  panel: SidePanel | null;
  onPanelChange: (panel: SidePanel | null) => void;
  peopleCount: number;
  /** Tasks given to this user that they haven't started. */
  newTaskCount: number;
  /** Errands not done yet; leave out on maps without errands. */
  errandsLeft?: number;
  /** The space's owner on a map built in the map builder: shows the Build button. */
  canBuild?: boolean;
  onLeave: () => void;
};

// The icon rail on the left of a space. It uses the same light glass as the zoom controls, so the
// map shows through; icons and labels carry a soft shadow to stay readable on any floor.
export function SpaceSidebar({
  panel,
  onPanelChange,
  peopleCount,
  newTaskCount,
  errandsLeft,
  canBuild,
  onLeave,
}: SpaceSidebarProps) {
  const toggle = (next: SidePanel) => onPanelChange(panel === next ? null : next);

  return (
    <nav
      aria-label="Space menu"
      className="absolute left-3 top-3 z-[70] flex max-h-[calc(100dvh-1.5rem)] w-[60px] flex-col items-center gap-1 overflow-y-auto rounded-2xl bg-[#1b1d2a]/20 p-1.5 ring-1 ring-white/30 backdrop-blur-[3px]"
    >
      <RailButton label="People" title={`People, ${peopleCount} in this space`} active={panel === "people"} badge={peopleCount} badgeTone="muted" onClick={() => toggle("people")}>
        <Users size={20} aria-hidden="true" />
      </RailButton>
      <RailButton label="Email" title="Write an email" active={panel === "email"} onClick={() => toggle("email")}>
        <Mail size={20} aria-hidden="true" />
      </RailButton>
      <RailButton
        label="Tasks"
        title={newTaskCount > 0 ? `Tasks, ${newTaskCount} not started` : "Tasks"}
        active={panel === "tasks"}
        badge={newTaskCount}
        onClick={() => toggle("tasks")}
      >
        <ClipboardList size={20} aria-hidden="true" />
      </RailButton>
      {errandsLeft !== undefined && (
        <RailButton
          label="Quests"
          title={errandsLeft > 0 ? `Quests, ${errandsLeft} to do` : "Quests, all done"}
          active={panel === "errands"}
          badge={errandsLeft}
          badgeTone="muted"
          onClick={() => toggle("errands")}
        >
          <Trophy size={20} aria-hidden="true" />
        </RailButton>
      )}
      {canBuild && (
        <RailButton label="Build" title="Build your map" active={panel === "builder"} onClick={() => toggle("builder")}>
          <Hammer size={20} aria-hidden="true" />
        </RailButton>
      )}
      {/* A new tab, so you stay in the space. */}
      <RailButton label="Games" title="Game Room: arcade games and the TV (opens in a new tab)" href="/arcade">
        <Gamepad2 size={20} aria-hidden="true" />
      </RailButton>

      <div className="my-1 h-px w-8 shrink-0 bg-white/60 shadow-[0_1px_1px_rgba(0,0,0,0.35)]" aria-hidden="true" />

      <RailButton label="Leave" title="Leave space" tone="danger" onClick={onLeave}>
        <LogOut size={19} aria-hidden="true" />
      </RailButton>
    </nav>
  );
}

function RailButton({
  label,
  title,
  active,
  badge,
  badgeTone = "alert",
  tone,
  onClick,
  href,
  children,
}: {
  label: string;
  title?: string;
  active?: boolean;
  badge?: number;
  badgeTone?: "alert" | "muted";
  tone?: "danger";
  onClick?: () => void;
  // A link that opens in a new tab, drawn like the buttons.
  href?: string;
  children: React.ReactNode;
}) {
  const className = `relative flex h-12 w-12 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-white transition [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.6))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 motion-reduce:transition-none ${
    tone === "danger"
      ? "hover:bg-[#e5484d]"
      : active
        ? "bg-black/30"
        : "hover:bg-black/20"
  }`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={title ?? label} title={title ?? label} className={className}>
        {children}
        <span aria-hidden="true">{label}</span>
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={tone === "danger" ? undefined : !!active}
      aria-label={title ?? label}
      title={title ?? label}
      className={className}
    >
      {children}
      <span aria-hidden="true">{label}</span>
      {!!badge && badge > 0 && (
        <span
          className={`absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${
            badgeTone === "muted" ? "bg-[#12151c]/80 text-white" : "bg-[#e5484d] text-white"
          }`}
          aria-hidden="true"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
