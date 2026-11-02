// What's inside an office server rack, and a simulated feed of the routine jobs such a rack runs.
// The panel (components/game-ui/server-rack.tsx) shows both; nothing here talks to a backend.

export type RackLed = "link" | "ok" | "disk" | "power";

export type RackUnit = {
  id: string;
  name: string;
  // Height in rack units (1U = 44.45 mm).
  size: 1 | 2;
  spec: string;
  what: string;
  leds: RackLed[];
};

// A typical small office rack, top to bottom. The specs are typical examples, not a real company's.
export const RACK_UNITS: RackUnit[] = [
  {
    id: "switch",
    name: "Network switch",
    size: 1,
    spec: "48 × 1 Gb ports · 4 × 10 Gb uplinks",
    what: "Connects every server in the rack to each other and, through its uplinks, to the rest of the office.",
    leds: ["link", "link", "link", "link", "link", "link"],
  },
  {
    id: "patch",
    name: "Patch panel",
    size: 1,
    spec: "24 network jacks",
    what: "Where the cables from desks end, so a connection can be moved with a short cable instead of a new one through the walls.",
    leds: [],
  },
  {
    id: "firewall",
    name: "Firewall",
    size: 1,
    spec: "Office network ↔ internet",
    what: "Checks traffic between the office and the internet, and lets staff in from home over a VPN.",
    leds: ["ok", "link", "link"],
  },
  {
    id: "ci",
    name: "Server · build runner",
    size: 1,
    spec: "16-core CPU · 64 GB RAM · 2 × 1 TB SSD",
    what: "Builds the code and runs the tests every time someone pushes a change.",
    leds: ["power", "disk", "link"],
  },
  {
    id: "vm",
    name: "Server · virtual machines",
    size: 2,
    spec: "2 × 24-core CPU · 256 GB ECC RAM · 6 × 2 TB SSD",
    what: "Runs several small machines in software at once: the staging site, the wiki, monitoring and a test database.",
    leds: ["power", "disk", "disk", "link"],
  },
  {
    id: "blank",
    name: "Blanking panel",
    size: 1,
    spec: "Empty slot",
    what: "Covers a gap so cold air is pulled through the servers instead of around them.",
    leds: [],
  },
  {
    id: "storage",
    name: "Storage shelf",
    size: 2,
    spec: "12 × 16 TB hard disks · RAID 6",
    what: "Holds shared files and backups. RAID 6 keeps every file readable even if two disks fail at once.",
    leds: ["disk", "disk", "disk", "disk", "disk", "disk"],
  },
  {
    id: "ups",
    name: "UPS",
    size: 2,
    spec: "Battery backup · 3 kVA",
    what: "Keeps the rack running for a few minutes in a power cut, long enough to shut everything down cleanly.",
    leds: ["power", "ok"],
  },
  {
    id: "pdu",
    name: "PDU",
    size: 1,
    spec: "Metered power strip",
    what: "Feeds power to each device and shows how much the whole rack draws.",
    leds: ["power"],
  },
];

export type RackTaskId =
  "backup" | "logs" | "health" | "ci" | "deploy" | "alert" | "cert" | "updates";

type RackTask = {
  name: string;
  running: string;
  done: string;
  // Set when the job can fail once and be retried.
  failed?: string;
  ms: number;
  // False for jobs that only run at night (shown from the feed's history).
  live: boolean;
};

export const RACK_TASKS: Record<RackTaskId, RackTask> = {
  backup: {
    name: "Nightly backup",
    running: "Copying changed files to the storage shelf",
    done: "Backup finished and checked",
    ms: 8000,
    live: false,
  },
  logs: {
    name: "Log rotation",
    running: "Compressing old logs, deleting ones past 30 days",
    done: "Logs rotated",
    ms: 3000,
    live: false,
  },
  health: {
    name: "Health checks",
    running: "Checking the wiki, staging site and build runner",
    done: "Every service answered",
    ms: 2000,
    live: true,
  },
  ci: {
    name: "CI build and tests",
    running: "Compiling and running the tests",
    done: "Build passed, tests green",
    failed: "A test timed out",
    ms: 9000,
    live: true,
  },
  deploy: {
    name: "Deploy to staging",
    running: "Copying the new build to the staging server",
    done: "Staging updated, smoke tests passed",
    failed: "Smoke test could not connect",
    ms: 7000,
    live: true,
  },
  alert: {
    name: "Monitoring alert",
    running: "Storage shelf over 85% full",
    done: "Old snapshots removed, alert cleared",
    ms: 6000,
    live: true,
  },
  cert: {
    name: "Certificate renewal",
    running: "Renewing the HTTPS certificate before it expires",
    done: "New certificate installed",
    failed: "Certificate authority did not answer",
    ms: 4000,
    live: true,
  },
  updates: {
    name: "Security updates",
    running: "Installing operating system patches",
    done: "Patches installed, no restart needed",
    ms: 5000,
    live: true,
  },
};

export type RackJob = {
  id: number;
  task: RackTaskId;
  status: "running" | "done" | "failed";
  retried: boolean;
  // Will fail once before passing on a retry.
  fails: boolean;
  started: number;
  // When the status last changed (shown), and when it changes next.
  at: number;
  until: number;
};

export const FEED_LENGTH = 6;
export const FEED_GAP_MS = 3500;
export const RETRY_MS = 2500;

// The last time the clock read hour:minute, today or yesterday.
export function lastAt(hour: number, minute: number, now: number) {
  const day = new Date(now);
  day.setHours(hour, minute, 0, 0);
  if (day.getTime() > now) day.setDate(day.getDate() - 1);
  return day.getTime();
}

// Last night's jobs, already done, and a health check under way.
export function startFeed(now: number): RackJob[] {
  const done = (id: number, task: RackTaskId, at: number): RackJob => ({
    id,
    task,
    status: "done",
    retried: false,
    fails: false,
    started: at,
    at,
    until: at,
  });
  return [
    {
      id: 3,
      task: "health",
      status: "running",
      retried: false,
      fails: false,
      started: now,
      at: now,
      until: now + RACK_TASKS.health.ms,
    },
    done(2, "backup", lastAt(2, 0, now)),
    done(1, "logs", lastAt(0, 0, now)),
  ];
}

// Moves each job on when its time is up, and starts a new one every FEED_GAP_MS.
export function stepFeed(
  jobs: readonly RackJob[],
  now: number,
  random: () => number = Math.random,
): RackJob[] {
  const next = jobs.map((job): RackJob => {
    if (job.status === "done" || job.until > now) return job;
    if (job.status === "running" && job.fails && !job.retried)
      return { ...job, status: "failed", at: now, until: now + RETRY_MS };
    if (job.status === "failed")
      return {
        ...job,
        status: "running",
        retried: true,
        at: now,
        until: now + RACK_TASKS[job.task].ms,
      };
    return { ...job, status: "done", at: now, until: now };
  });
  const latest = Math.max(-Infinity, ...next.map((job) => job.started));
  if (now - latest < FEED_GAP_MS) return next;
  // Not one still going, nor one of the last few (a job that just ran doesn't run again at once).
  const busy = new Set(
    next
      .filter((job, i) => job.status !== "done" || i < 3)
      .map((job) => job.task),
  );
  const free = (Object.keys(RACK_TASKS) as RackTaskId[]).filter(
    (task) => RACK_TASKS[task].live && !busy.has(task),
  );
  if (!free.length) return next;
  const task = free[Math.floor(random() * free.length) % free.length]!;
  const job: RackJob = {
    id: Math.max(0, ...next.map((each) => each.id)) + 1,
    task,
    status: "running",
    retried: false,
    fails: !!RACK_TASKS[task].failed && random() < 0.25,
    started: now,
    at: now,
    until: now + RACK_TASKS[task].ms,
  };
  return [job, ...next].slice(0, FEED_LENGTH);
}
