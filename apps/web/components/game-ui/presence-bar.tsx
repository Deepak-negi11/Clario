"use client";


export type PresencePerson = {
  id: string;
  name: string;
  isSelf: boolean;
  isNearby?: boolean;
};

type PresenceBarProps = {
  people: PresencePerson[];
};




export function PresenceBar({ people }: PresenceBarProps) {
  return (
    <div className="pointer-events-none absolute left-4 top-4 flex flex-col items-start gap-2">

      <div className="pointer-events-auto inline-flex items-center gap-1.5 bg-transparent p-0 border-none shadow-none backdrop-blur-none select-none">
        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
        </span>
        <span className="text-sm font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
          {people.length}
        </span>
      </div>
    </div>
  );
}
