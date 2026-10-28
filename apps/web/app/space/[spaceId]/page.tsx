"use client";

/*//User opens URL
        │
        ▼
Load space information
        │
        ▼
Check login
        │
        ▼
Show pre-join screen
        │
        ▼
User enters name
        │
        ▼
Join WebSocket
        │
        ▼
Load Phaser game
        │
        ▼
Show chat
Show players
Show video
Show controls
*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { MessageSquare } from "lucide-react";
import { ERRANDS, WORK_LEVEL_INFO, getChatRoom, getChatRoomAtPosition, type AvatarLook, type MapTemplateId, type WorkLevel } from "@repo/shared";
import { useSpaceSocket } from "../../../hooks/use-space-socket";
import { useProximityVideo } from "../../../hooks/use-proximity-video";
import { useLocalMedia, type LocalMediaController } from "../../../hooks/use-local-media";
import { useSwipeRight } from "../../../hooks/use-swipe-right";
import { useErrands } from "../../../hooks/use-errands";
import { ControlBar } from "../../../components/game-ui/control-bar";
import { ChatPanel, type ChatChannel } from "../../../components/game-ui/chat-panel";
import { EmailComposer } from "../../../components/game-ui/email-composer";
import { SpaceSidebar, type SidePanel } from "../../../components/game-ui/space-sidebar";
import { PeoplePanel, type PanelPerson } from "../../../components/game-ui/people-panel";
import { TasksPanel, countNewTasks, useSpaceTasks } from "../../../components/game-ui/tasks-panel";
import { MapControls } from "../../../components/game-ui/map-controls";
import { ErrandCelebrationCard, ErrandChoice, ErrandHud, ErrandsPanel } from "../../../components/game-ui/errands";
import { MentorOnMap } from "../../../components/practice-session/mentor-on-map";
import { createSceneBridge } from "../../../components/phaser/scene-bridge";
import { PixelPet } from "../../../components/game-ui/pixel-pet";
import { AgentWorkspace } from "../../../components/game-ui/agent-workspace";
import { MediaDock } from "../../../components/game-ui/video-tile";
import { PrejoinScreen } from "../../../components/game-ui/prejoin-screen";
import { getSpace, getUsersMetadata } from "../../../lib/space-api";
import { getMyProfile, updateProfile } from "../../../lib/auth-api";
import { getAuthToken } from "../../../lib/auth-token";
import { saveLook } from "../../../lib/avatar/saved-look";
import { isNearby } from "../../../lib/proximity";

const PhaserGame = dynamic(
  () => import("../../../components/phaser/phaser-game").then((module) => module.PhaserGame),
  { ssr: false },
);

// three.js only loads when someone opens the 3D view.
const Office3D = dynamic(
  () => import("../../../components/space-3d/office-3d").then((module) => module.Office3D),
  { ssr: false },
);

const PANEL_KEY = "clario:side-panel";

function readSavedPanel(): SidePanel | null {
  try {
    const saved = localStorage.getItem(PANEL_KEY);
    return saved === "people" || saved === "chat" || saved === "tasks" ? saved : null;
  } catch {
    return null;
  }
}

export default function SpacePage() {
  const params = useParams<{ spaceId: string }>();
  const router = useRouter();
  const media = useLocalMedia();
  const [mapTemplate, setMapTemplate] = useState<MapTemplateId | null>(null);
  const [spaceName, setSpaceName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [savedLevel, setSavedLevel] = useState<WorkLevel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // So let me explain you what this is so suppose in the map or the space in when i used to refresh it used to deligate me to the pre join page (space page) so now we the browser remeber we already entered all that 
  const [hasEntered, setHasEntered] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(`metaverse:entered:${params.spaceId}`) === "true";
    }
    return false;
  });

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace("/signin");
      return;
    }

    setDisplayName(localStorage.getItem("metaverse:username")?.trim() || "Guest");
    getSpace(token, params.spaceId)
      .then((space) => {
        setMapTemplate(space.mapTemplate);
        setSpaceName(space.name);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Could not load this space");
      });
    // Only pre-selects the level step; if it fails, the user just picks again.
    getMyProfile(token)
      .then((profile) => setSavedLevel(profile.level))
      .catch(() => {});
  }, [params.spaceId, router]);

  if (loadError || !mapTemplate) {
    return <SpaceLoading error={loadError} />;
  }

  
  if (!hasEntered) {
    return (
      <PrejoinScreen
        media={media}
        spaceName={spaceName}
        initialName={displayName}
        initialLevel={savedLevel}
        onEnter={async (name, look, level) => {
          const token = getAuthToken();
          if (!token) throw new Error("You are not signed in.");
          await updateProfile(token, { ...(name !== displayName ? { username: name } : {}), avatarLook: look, level });
          saveLook(look);
          localStorage.setItem("metaverse:username", name);
          sessionStorage.setItem(`metaverse:entered:${params.spaceId}`, "true");
          setDisplayName(name);
          setHasEntered(true);
        }}
      />
    );
  }

  return (
    <LiveSpace
      spaceId={params.spaceId}
      mapTemplate={mapTemplate}
      media={media}
      initialDisplayName={displayName}
      onLeave={() => {
        sessionStorage.removeItem(`metaverse:entered:${params.spaceId}`);
        router.push("/spaces");
      }}
    />
  );
}

function LiveSpace({
  spaceId,
  mapTemplate,
  media,
  initialDisplayName,
  onLeave,
}: {
  spaceId: string;
  mapTemplate: MapTemplateId;
  media: LocalMediaController;
  initialDisplayName: string;
  onLeave: () => void;
}) {
  const {
    status,
    error,
    selfId,
    self,
    others,
    move,
    generalMessages,
    roomMessages,
    currentRoom,
    sendChat,
    reactions,
    sendReaction,
    looks,
    sendLook,
    agentActivities,
    sendSignal,
    registerSignalHandler,
    chatRequests,
    outgoingRequests,
    directChats,
    requestChat,
    answerChatRequest,
    sendDirect,
    tasksChangedAt,
  } = useSpaceSocket(spaceId, mapTemplate);
  const spaceTasks = useSpaceTasks(spaceId, tasksChangedAt);

  const othersRef = useRef(others);
  othersRef.current = others;
  const selfRef = useRef(self);
  selfRef.current = self;
  const moveRef = useRef(move);
  moveRef.current = move;
  const reactionsRef = useRef(reactions);
  reactionsRef.current = reactions;
  const activitiesRef = useRef(agentActivities);
  activitiesRef.current = agentActivities;

  const [names, setNames] = useState<Record<string, string>>({});
  const namesRef = useRef(names);
  namesRef.current = names;
  // Work levels, loaded with names. Someone who changes level shows the new one after a reload.
  const [levels, setLevels] = useState<Record<string, WorkLevel | null>>({});
  // Each player's avatar colours; the map reads this every frame, so no re-render is needed.
  const looksRef = useRef<Record<string, AvatarLook>>({});
  // Changes made in the space (yours and others') arrive over the socket after the first fetch.
  Object.assign(looksRef.current, looks);
  const fetchedIds = useRef<Set<string>>(new Set());

  const bridgeRef = useRef(createSceneBridge());
  const [panel, setPanelState] = useState<SidePanel | null>(readSavedPanel);
  const setPanel = useCallback((next: SidePanel | null) => {
    setPanelState(next);
    try {
      if (next) localStorage.setItem(PANEL_KEY, next);
      else localStorage.removeItem(PANEL_KEY);
    } catch {
      // Storage can be unavailable (private mode); the panel still works for this visit.
    }
  }, []);
  // A two-finger swipe to the right on the trackpad opens the email composer.
  useSwipeRight(() => setPanel("email"), status === "joined");
  const [chatChannel, setChatChannel] = useState<ChatChannel>("general");
  const onlineIds = useMemo(() => new Set(Object.keys(others)), [others]);
  const [view3d, setView3d] = useState(false);
  const can3d = mapTemplate === "clario-hq";
  // False until the map has loaded its art; the blue loading screen stays up until then.
  const [mapReady, setMapReady] = useState(false);

  // Errands (Clario HQ only): timed runs to rooms that end with choosing the best message.
  const errands = useErrands(selfId, currentRoom?.id ?? null, can3d);
  const errandRunning = !!errands.run && errands.run.arrivedAt === null;
  const errandRoomId = errandRunning && errands.errand && errands.run ? errands.errand.steps[errands.run.step]?.room ?? null : null;
  const errandTarget = useMemo(() => (errandRoomId ? getChatRoom(mapTemplate, errandRoomId)?.bounds ?? null : null), [errandRoomId, mapTemplate]);
  useEffect(() => {
    // The 2D map sets up its marker once it has drawn.
    if (mapReady) bridgeRef.current.setErrandTarget?.(errandTarget);
  }, [errandTarget, mapReady]);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const playerClickRef = useRef<((userId: string | null) => void) | null>(null);
  // The card is about other people; a click on yourself never opens one.
  playerClickRef.current = (userId: string | null) => setSelectedPlayerId(userId === selfId ? null : userId);

  const nearbyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, position] of Object.entries(others)) {
      if (isNearby(self, position)) ids.add(id);
    }
    return ids;
  }, [self, others]);
  const peopleInRoom = useMemo(() => {
    if (!currentRoom) return 0;
    const inRoom = Object.values(others).filter((position) => getChatRoomAtPosition(mapTemplate, position)?.id === currentRoom.id);
    return inRoom.length + 1;
  }, [currentRoom, others, mapTemplate]);

  const nearbyRef = useRef(nearbyIds);
  nearbyRef.current = nearbyIds;

  const { localStream, remoteStreams, remoteScreenStreams, micOn, camOn, screenOn, toggleMic, toggleCam, toggleScreen } = useProximityVideo({
    selfId,
    nearbyIds,
    localStream: media.stream,
    screenStream: media.screenStream,
    micOn: media.micOn,
    camOn: media.camOn,
    screenOn: media.screenOn,
    toggleMic: media.toggleMic,
    toggleCam: media.toggleCam,
    toggleScreen: media.toggleScreen,
    sendSignal,
    registerSignalHandler,
  });

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    const ids = [selfId, ...Object.keys(others)].filter((value): value is string => !!value);
    const missing = ids.filter((id) => !fetchedIds.current.has(id));
    if (missing.length === 0) return;

    missing.forEach((id) => fetchedIds.current.add(id));
    getUsersMetadata(token, missing)
      .then((response) => {
        for (const user of response.avatars) {
          if (user.look) looksRef.current[user.userId] = user.look;
        }
        setNames((previous) => {
          const next = { ...previous };
          for (const user of response.avatars) next[user.userId] = user.username;
          return next;
        });
        setLevels((previous) => {
          const next = { ...previous };
          for (const user of response.avatars) next[user.userId] = user.level ?? null;
          return next;
        });
      })
      .catch(() => {
        missing.forEach((id) => fetchedIds.current.delete(id));
      });
  }, [selfId, others]);

  const handleUpdateName = async (newName: string) => {
    const token = getAuthToken();
    if (!token || !selfId) return;
    await updateProfile(token, { username: newName });
    setNames((previous) => ({ ...previous, [selfId]: newName }));
  };

  const handleUpdateLook = async (look: AvatarLook) => {
    const token = getAuthToken();
    if (!token || !selfId) return;
    await updateProfile(token, { avatarLook: look });
    saveLook(look);
    sendLook(look);
  };

  const people = useMemo(() => {
    const list: PanelPerson[] = [];
    const formatName = (name: string) => name.length > 20 ? `${name.slice(0, 20)}...` : name;

    if (selfId) {
      list.push({
        id: selfId,
        name: formatName(names[selfId] ?? initialDisplayName ?? "You"),
        isSelf: true,
        isNearby: false,
        position: self,
        level: levels[selfId] ?? null,
      });
    }
    for (const id of Object.keys(others)) {
      list.push({
        id,
        name: formatName(names[id] ?? id.slice(0, 5)),
        isSelf: false,
        isNearby: nearbyIds.has(id),
        position: others[id] ?? null,
        level: levels[id] ?? null,
      });
    }
    return list;
  }, [selfId, self, others, names, levels, nearbyIds, initialDisplayName]);

  if (status !== "joined") return <SpaceLoading error={error} />;

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#1b1d2a] text-neutral-100">
      <SpaceSidebar
        panel={panel}
        onPanelChange={setPanel}
        peopleCount={people.length}
        newTaskCount={countNewTasks(spaceTasks.tasks)}
        errandsLeft={can3d ? ERRANDS.filter((errand) => !errands.progress.done[errand.id]).length : undefined}
        can3d={can3d}
        view3d={view3d}
        onToggle3d={() => setView3d((open) => !open)}
        onLeave={onLeave}
      />
      <main className="absolute inset-0 overflow-hidden">
      <PhaserGame
        mapTemplate={mapTemplate}
        othersRef={othersRef}
        selfRef={selfRef}
        moveRef={moveRef}
        namesRef={namesRef}
        looksRef={looksRef}
        nearbyRef={nearbyRef}
        reactionsRef={reactionsRef}
        activitiesRef={activitiesRef}
        playerClickRef={playerClickRef}
        bridgeRef={bridgeRef}
        selfId={selfId}
        onReady={() => setMapReady(true)}
      />
      {currentRoom && !selectedPlayerId && (
        <div
          className={`pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 items-center gap-2 rounded-lg bg-[#12151c]/85 px-3 py-1.5 text-white shadow-lg backdrop-blur-sm ${errandRunning ? "hidden sm:flex" : "flex"}`}
          role="status"
        >
          <span className="h-1.5 w-1.5 bg-white" aria-hidden="true" />
          <span className="text-sm font-semibold">{currentRoom.name}</span>
          <span className="text-xs text-white/60">· {peopleInRoom} here</span>
        </div>
      )}
      {selectedPlayerId && (
        <PlayerAgentCard
          activity={agentActivities[selectedPlayerId]}
          name={(selectedPlayerId === selfId ? (names[selfId] ?? "You") : (names[selectedPlayerId] ?? selectedPlayerId.slice(0, 5)))}
          level={levels[selectedPlayerId] ?? null}
          onClose={() => setSelectedPlayerId(null)}
          chat={selectedPlayerId === selfId || !onlineIds.has(selectedPlayerId) ? null : {
            state: directChats[selectedPlayerId]?.open
              ? "open"
              : chatRequests.some((request) => request.fromUserId === selectedPlayerId)
                ? "incoming"
                : outgoingRequests[selectedPlayerId] ?? "none",
            onRequest: () => requestChat(selectedPlayerId),
            onAccept: () => {
              answerChatRequest(selectedPlayerId, true);
              setChatChannel(`dm:${selectedPlayerId}`);
              setPanel("chat");
              setSelectedPlayerId(null);
            },
            onOpen: () => {
              setChatChannel(`dm:${selectedPlayerId}`);
              setPanel("chat");
              setSelectedPlayerId(null);
            },
          }}
        />
      )}
      <MediaDock
        selfName={(selfId ? names[selfId] : undefined) ?? initialDisplayName ?? "You"}
        localStream={localStream}
        localScreenStream={media.screenStream}
        remoteStreams={remoteStreams}
        remoteScreenStreams={remoteScreenStreams}
        nearbyIds={nearbyIds}
        names={names}
      />
      <MapControls bridgeRef={bridgeRef} />
      <ControlBar
        displayName={(selfId ? names[selfId] : undefined) ?? "You"}
        onReact={sendReaction}
        micOn={micOn}
        camOn={camOn}
        screenOn={screenOn}
        onToggleMic={() => void toggleMic()}
        onToggleCam={() => void toggleCam()}
        onToggleScreen={() => void toggleScreen()}
        onUpdateName={handleUpdateName}
        look={selfId ? looksRef.current[selfId] ?? null : null}
        onUpdateLook={handleUpdateLook}
      />
      {can3d && view3d && (
        <Office3D
          selfId={selfId}
          selfRef={selfRef}
          othersRef={othersRef}
          namesRef={namesRef}
          onClose={() => setView3d(false)}
          onWalkTo={(x, y) => bridgeRef.current.walkTo?.(x, y)}
          errandTarget={errandTarget}
        />
      )}
      {errands.run && errands.errand && (errandRunning ? (
        <ErrandHud
          errand={errands.errand}
          run={errands.run}
          now={errands.now}
          self={self}
          raised={can3d && view3d}
          onCancel={errands.cancel}
        />
      ) : (
        <ErrandChoice
          errand={errands.errand}
          run={errands.run}
          lastPick={errands.lastPick}
          onPick={errands.pick}
          onCancel={errands.cancel}
        />
      ))}
      {errands.celebration && <ErrandCelebrationCard celebration={errands.celebration} onClose={errands.dismissCelebration} />}
      <MentorOnMap bridgeRef={bridgeRef} />
      </main>
      {panel === "people" && (
        <PeoplePanel
          people={people}
          mapTemplate={mapTemplate}
          onWalkTo={(position) => bridgeRef.current.walkTo?.(position.x, position.y)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "errands" && can3d && (
        <ErrandsPanel
          progress={errands.progress}
          run={errands.run}
          onStart={(errandId) => {
            errands.start(errandId);
            setPanel(null);
          }}
          onCancel={errands.cancel}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "tasks" && (
        <TasksPanel
          spaceId={spaceId}
          tasks={spaceTasks.tasks}
          loadError={spaceTasks.error}
          people={people}
          onChanged={() => void spaceTasks.reload()}
          onClose={() => setPanel(null)}
        />
      )}
      <ChatPanel
        generalMessages={generalMessages}
        roomMessages={roomMessages}
        currentRoom={currentRoom}
        names={names}
        selfId={selfId}
        onSend={sendChat}
        open={panel === "chat"}
        onOpen={() => setPanel("chat")}
        onClose={() => setPanel(null)}
        channel={chatChannel}
        onChannelChange={setChatChannel}
        directChats={directChats}
        chatRequests={chatRequests}
        outgoingRequests={outgoingRequests}
        onlineIds={onlineIds}
        onAnswerRequest={answerChatRequest}
        onSendDirect={sendDirect}
        onRequestChat={requestChat}
      />
      <EmailComposer
        open={panel === "email"}
        spaceId={spaceId}
        people={people}
        onClose={() => setPanel(null)}
      />
      {/* Covers the black canvas and the controls while the map is still loading. */}
      {!mapReady && (
        <div className="absolute inset-0 z-[100]">
          <SpaceLoading error={null} />
        </div>
      )}
    </div>
  );
}

function SpaceLoading({ error }: { error: string | null }) {
  return (
    <div className="grid h-screen place-items-center bg-[#dbe8f8] p-6 text-[#111827]">
      <div className="border-2 border-[#111827] bg-[#f8fbff] p-6 text-center shadow-[5px_5px_0_#183a8f]">
        <p className="font-mono text-xs font-bold tracking-[0.12em] text-[#183a8f]">JOINING SPACE</p>
        <p className="mt-2 text-lg font-bold tracking-[-0.03em]">{error ?? "Loading your space…"}</p>
      </div>
    </div>
  );
}

type PlayerChat = {
  state: "none" | "pending" | "declined" | "incoming" | "open";
  onRequest: () => void;
  onAccept: () => void;
  onOpen: () => void;
};

function PlayerAgentCard({
  activity,
  name,
  level,
  onClose,
  chat,
}: {
  activity:
    | { text: string; state: "cooking" | "done"; at: number; project?: string; branch?: string; commit?: string }
    | undefined;
  name: string;
  level: WorkLevel | null;
  onClose: () => void;
  /** Private chat with this person; null when it's you. */
  chat: PlayerChat | null;
}) {
  const isCooking = activity?.state === "cooking";
  const chatAction = chat && {
    none: { hint: "Only the two of you will see it.", label: "Request chat", onClick: chat.onRequest },
    pending: { hint: `Waiting for ${name} to accept.`, label: "Request sent", onClick: undefined },
    declined: { hint: `${name} said no for now. You can ask again in a minute.`, label: "Ask again", onClick: chat.onRequest },
    incoming: { hint: `${name} asked to chat with you.`, label: "Accept", onClick: chat.onAccept },
    open: { hint: "You're chatting privately.", label: "Open chat", onClick: chat.onOpen },
  }[chat.state];

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-50 w-[min(23rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur-md">
      <div className="flex items-start gap-3 p-4">
        <div className="flex w-14 shrink-0 flex-col items-center pt-0.5">
          <PixelPet running={isCooking} size={46} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-slate-800">{name}</span>
              {level && (
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-600">
                  {WORK_LEVEL_INFO[level].label}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 cursor-pointer rounded p-1 text-slate-400 transition hover:text-slate-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {isCooking && activity ? (
            <>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-orange-600">
                  Agent running · Claude Code
                </span>
              </div>
              <AgentWorkspace project={activity.project} branch={activity.branch} commit={activity.commit} />
              <p className="mt-2 break-words rounded-lg border border-slate-100 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed text-emerald-700">
                {activity.text}
              </p>
              <p className="mt-2 text-[9px] uppercase tracking-wider text-slate-400">
                updated {Math.max(0, Math.floor((Date.now() - activity.at) / 1000))}s ago
              </p>
            </>
          ) : (
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              Agent not running — the pet is asleep.
            </p>
          )}
        </div>
      </div>
      {chatAction && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
          <span className="min-w-0 text-[11px] leading-4 text-slate-500">{chatAction.hint}</span>
          <button
            type="button"
            onClick={chatAction.onClick}
            disabled={!chatAction.onClick}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#12151c] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] active:scale-[0.98] disabled:cursor-default disabled:bg-slate-200 disabled:text-slate-500"
          >
            <MessageSquare size={13} aria-hidden="true" />
            {chatAction.label}
          </button>
        </div>
      )}
    </div>
  );
}
