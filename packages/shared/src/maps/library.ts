// Original short reads for the office bookshelves. Fixed IDs and bounded pages keep the shared
// prop small; no visitor-supplied text or URLs travel with a book.
export const BOOK_IDS = ["small-wins", "good-teams", "fresh-eyes"] as const;
export type BookId = typeof BOOK_IDS[number];
export const BOOK_PAGE_COUNT = 4;
export const SIP_DURATION_MS = 1700;
export const PAGE_TURN_MS = 650;
export const LIBRARY_BOOKS: Record<BookId, { title: string; color: string; pages: readonly { title: string; text: string }[] }> = {
  "small-wins": { title: "The Little Book of Small Wins", color: "#326c69", pages: [
    { title: "Make a little room", text: "A clear desk can start with one small corner. Put one thing back, open the page you need, and let the next step be small enough to begin." },
    { title: "One thing at a time", text: "Give one task your full attention for a few minutes. Write the other ideas down so they can wait their turn. Finishing something small makes space for something new." },
    { title: "Leave a breadcrumb", text: "Before a break, write one sentence about where to start again. Tomorrow's you will appreciate the clue. Good work can pause without getting lost." },
    { title: "Notice the progress", text: "Some days the win is a finished feature. Some days it is a useful question, a kind reply, or finding the bug. Save a small win from today before you close the book." },
  ] },
  "good-teams": { title: "Notes from a Good Team", color: "#aa6848", pages: [
    { title: "Start with a question", text: "A good question leaves room for an answer you did not expect. Ask what someone is trying to achieve before offering a solution. Understanding comes before advice." },
    { title: "Show the rough draft", text: "An unfinished idea is easier to improve together than a perfect surprise. Share the sketch, name the uncertain part, and ask for one useful piece of feedback." },
    { title: "Make room for quiet", text: "A pause is not an empty space. It can be someone thinking. Offer a moment to write ideas down before a meeting decides which voice to follow." },
    { title: "Pass the credit on", text: "Name the person who helped. Thank the reviewer, the careful tester, and the teammate who asked the awkward question. A team gets stronger when its work is seen." },
  ] },
  "fresh-eyes": { title: "A Pocketful of Fresh Ideas", color: "#736091", pages: [
    { title: "Take the long way", text: "Look at a familiar problem from another seat. Sketch it, explain it aloud, or ask what a new teammate would notice. A change of view can reveal a smaller next step." },
    { title: "Collect a detail", text: "A pattern on a leaf, a well-made handle, a useful sign: small details teach us how things work. Save one observation today and ask why it caught your eye." },
    { title: "Try the tiny version", text: "Give an idea a quick, simple form. A paper sketch or a short prototype can answer a question that a long discussion cannot. Keep the experiment small enough to learn from." },
    { title: "Let it rest", text: "You do not have to solve every puzzle in one sitting. Leave your notes in order, stretch, and look somewhere else. Come back with a little room for a new thought." },
  ] },
};
