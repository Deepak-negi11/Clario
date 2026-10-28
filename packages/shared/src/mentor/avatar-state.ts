// What Maya's avatar is doing. The panel and her sprite on the map both follow this.
//
//   idle ──mic──► listening ──heard──► thinking ──reply──► speaking ──speech end──► idle
//   listening ──mic again / nothing heard──► idle      speaking ──mic (interrupt)──► listening
//   a typed question goes straight to thinking, and its reply is only text (speak: false);
//   "Listen" on a reply reads it aloud: idle ──read aloud──► speaking.
//   Closing the panel always returns to idle.

export type MentorState = "idle" | "listening" | "thinking" | "speaking"

export type MentorEvent =
    | { type: "MIC_START" }
    | { type: "MIC_STOP" }
    | { type: "HEARD" }
    | { type: "SEND_TEXT" }
    | { type: "REPLY"; speak: boolean }
    | { type: "SPEECH_END" }
    | { type: "READ_ALOUD" }
    | { type: "CLOSE" }

export function nextMentorState(state: MentorState, event: MentorEvent): MentorState {
    if (event.type === "CLOSE") return "idle"

    switch (state) {
        case "idle":
            if (event.type === "MIC_START") return "listening"
            if (event.type === "SEND_TEXT") return "thinking"
            if (event.type === "READ_ALOUD") return "speaking"
            return state
        case "listening":
            if (event.type === "HEARD" || event.type === "SEND_TEXT") return "thinking"
            if (event.type === "MIC_STOP") return "idle"
            return state
        case "thinking":
            // The mic stays off while waiting, so a reply is never talked over by accident.
            if (event.type === "REPLY") return event.speak ? "speaking" : "idle"
            return state
        case "speaking":
            if (event.type === "MIC_START") return "listening"
            if (event.type === "SEND_TEXT") return "thinking"
            if (event.type === "SPEECH_END") return "idle"
            return state
    }
}
