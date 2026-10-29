import { describe, expect, test } from "bun:test";
import {
    applyToneFlag,
    EmailAssistRequestSchema,
    findInformalWords,
    firstName,
    mergeToneFlags,
    readEmailAssist,
    type EmailAssistRequest,
    type ToneFlag,
} from "./email-assist";

function request(fields: Partial<EmailAssistRequest>): EmailAssistRequest {
    return { mode: "suggest", recipientName: "arjun mehta", subject: "Staging login", body: "", ...fields };
}

function flag(fields: Partial<ToneFlag>): ToneFlag {
    return { field: "body", quote: "", suggestion: "", reason: "Too casual.", ...fields };
}

describe("findInformalWords", () => {
    test("flags family words with the person's name in the message", () => {
        const flags = findInformalWords("Hi bhaiya, can you check this? Thanks dada", "body", "arjun mehta");
        expect(flags.map((item) => [item.quote, item.suggestion])).toEqual([
            ["bhaiya", "Arjun"],
            ["dada", "Arjun"],
        ]);
    });

    test("leaves family words out of the subject", () => {
        expect(findInformalWords("Bhaiya need help with staging login", "subject", "Arjun")).toEqual([
            expect.objectContaining({ field: "subject", quote: "Bhaiya", suggestion: "" }),
        ]);
    });

    test("flags chat shorthand with the full word, in the order it appears", () => {
        const flags = findInformalWords("hey pls send it tmrw, thx", "body");
        expect(flags.map((item) => [item.quote, item.suggestion])).toEqual([
            ["pls", "please"],
            ["tmrw", "tomorrow"],
            ["thx", "thanks"],
        ]);
    });

    test("keeps the writer's own spelling of the word", () => {
        expect(findInformalWords("PLS check", "body")[0]?.quote).toBe("PLS");
    });

    test("does not flag words inside other words or normal work English", () => {
        expect(findInformalWords("Kindly review the brother-in-law module and the U.S. rollout", "body")).toEqual([]);
        expect(findInformalWords("Please prepone the standup; Bhaiyaji's PR is ready", "body")).toEqual([]);
        expect(findInformalWords("U-turn on the Q4 plan, see doc/u", "body")).toEqual([]);
    });

    test("a capital U is not read as 'you'", () => {
        expect(findInformalWords("Plan U is ready", "body")).toEqual([]);
        expect(findInformalWords("can u check", "body")[0]?.suggestion).toBe("you");
    });

    test("with no recipient, family words are left out", () => {
        expect(findInformalWords("thanks bro", "body", "")[0]?.suggestion).toBe("");
    });
});

describe("applyToneFlag", () => {
    test("puts the name in place of a family word", () => {
        expect(applyToneFlag("Hi bhaiya, can you check?", flag({ quote: "bhaiya", suggestion: "Arjun" }))).toBe("Hi Arjun, can you check?");
    });

    test("keeps a capital at the start of a sentence", () => {
        expect(applyToneFlag("Pls check. pls reply", flag({ quote: "Pls", suggestion: "please" }))).toBe("Please check. pls reply");
        expect(applyToneFlag("Done. pls reply", flag({ quote: "pls", suggestion: "please" }))).toBe("Done. Please reply");
    });

    test("removes a word and tidies the comma and spaces", () => {
        expect(applyToneFlag("Hi bhaiya, can you check", flag({ quote: "bhaiya" }))).toBe("Hi, can you check");
        expect(applyToneFlag("can you check yaar", flag({ quote: "yaar" }))).toBe("can you check");
        expect(applyToneFlag("check yaar please", flag({ quote: "yaar" }))).toBe("check please");
    });

    test("removing the first word capitalises the next one", () => {
        expect(applyToneFlag("bhaiya, need help with login", flag({ quote: "bhaiya" }))).toBe("Need help with login");
        expect(applyToneFlag("Hi Arjun,\nbro the build broke", flag({ quote: "bro" }))).toBe("Hi Arjun,\nThe build broke");
    });

    test("leaves the text alone when the words are gone", () => {
        expect(applyToneFlag("Hi Arjun", flag({ quote: "bhaiya", suggestion: "Arjun" }))).toBe("Hi Arjun");
    });
});

describe("mergeToneFlags", () => {
    test("drops AI flags that repeat a listed word or whose words were edited away", () => {
        const text = "hey dada pls fix this";
        const local = findInformalWords(text, "body", "Arjun");
        const ai = [
            flag({ quote: "hey dada", suggestion: "Hi Arjun" }),
            flag({ quote: "fix this", suggestion: "take a look at this" }),
            flag({ quote: "do the needful", suggestion: "handle it" }),
        ];
        expect(mergeToneFlags(text, local, ai).map((item) => item.quote)).toEqual(["dada", "pls", "fix this"]);
    });
});

describe("readEmailAssist", () => {
    test("suggest: keeps the message and the subject flags the writer really wrote", () => {
        const raw = JSON.stringify({
            body: "Hi Arjun,\n\nI can't log in to staging. Could you take a look when you have a moment?\n\nThanks,",
            flags: [
                { quote: "bhaiya", suggestion: "", reason: "Too familiar." },
                { quote: "boss", suggestion: "Arjun", reason: "Made up: not in the subject." },
            ],
        });
        const result = readEmailAssist(raw, request({ subject: "bhaiya staging login broken" }));
        expect(result?.body).toBe("Hi Arjun,\n\nI can't log in to staging. Could you take a look when you have a moment?\n\nThanks,");
        expect(result?.flags).toEqual([{ field: "subject", quote: "bhaiya", suggestion: "", reason: "Too familiar." }]);
    });

    test("suggest: removes a subject line, markdown and name placeholders", () => {
        const raw = JSON.stringify({ body: "Subject: Login\n\nHi **Arjun**,\nCould you help?\n\nThanks,\n[Your Name]", flags: [] });
        expect(readEmailAssist(raw, request({}))?.body).toBe("Hi Arjun,\nCould you help?\n\nThanks,");
    });

    test("suggest: puts a closing stuck to the last sentence on its own line", () => {
        const raw = JSON.stringify({ body: "Hi Arjun,\n\nCould you help with the staging login? Thanks", flags: [] });
        expect(readEmailAssist(raw, request({}))?.body).toBe("Hi Arjun,\n\nCould you help with the staging login?\n\nThanks,");
    });

    test("suggest: no usable message means no answer", () => {
        expect(readEmailAssist(JSON.stringify({ body: "  ", flags: [] }), request({}))).toBeNull();
        expect(readEmailAssist("Sure! Here is an email:", request({}))).toBeNull();
        expect(readEmailAssist('{"body": "Hi Arjun, could', request({}))).toBeNull();
        const refusal = "Hi Rahul,\n\nI cannot fulfill this request. My safety guidelines prevent it.\n\nThanks,";
        expect(readEmailAssist(JSON.stringify({ body: refusal, flags: [] }), request({}))).toBeNull();
    });

    test("check: flags only words in the message, drops no-op and overlong ones", () => {
        const body = "hey dada pls fix asap, it is blocking the whole release for everyone today";
        const raw = "```json\n" + JSON.stringify({
            body: "",
            flags: [
                { quote: "Dada", suggestion: "Arjun", reason: "Too familiar." },
                { quote: "fix asap", suggestion: "fix asap", reason: "No change." },
                { quote: "it is blocking the whole release for everyone", suggestion: "it blocks the release", reason: "Too long." },
                { quote: "pls", suggestion: "please" },
                "not a flag",
            ],
        }) + "\n```";
        const result = readEmailAssist(raw, request({ mode: "check", body }));
        expect(result?.body).toBeUndefined();
        expect(result?.flags.map((item) => [item.field, item.quote, item.suggestion])).toEqual([
            ["body", "dada", "Arjun"],
            ["body", "pls", "please"],
        ]);
        expect(result?.flags[1]?.reason).not.toBe("");
    });
});

describe("EmailAssistRequestSchema", () => {
    test("check needs a message; suggest needs only a subject", () => {
        expect(EmailAssistRequestSchema.safeParse({ mode: "check", subject: "Login", body: " " }).success).toBe(false);
        expect(EmailAssistRequestSchema.safeParse({ mode: "suggest", subject: "Login" }).success).toBe(true);
        expect(EmailAssistRequestSchema.safeParse({ mode: "suggest", subject: "   " }).success).toBe(false);
    });

    test("firstName greets by the first name, capitalised", () => {
        expect(firstName("deepak negi")).toBe("Deepak");
        expect(firstName("")).toBe("");
    });
});
