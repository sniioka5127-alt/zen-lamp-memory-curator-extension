const $ = (id) => document.getElementById(id);

const depthEl = $("depth");
const modeEl = $("mode");
const existingMemoryWrap = $("existingMemoryWrap");
const existingMemoryEl = $("existingMemory");
const conversationEl = $("conversation");
const outputEl = $("output");

modeEl.addEventListener("change", () => {
  existingMemoryWrap.classList.toggle("hidden", modeEl.value !== "update");
});

function simplePrompt(conversation) {
  return `You are a Memory Curator for long AI conversations.

Your task is not to summarize everything.
Your task is to help me decide what should be carried forward.

Read the conversation below and sort useful information into four categories.

1. Keep
Important facts, decisions, rules, ideas, or context that should be carried into future work.

2. Maybe
Interesting ideas, uncertain points, or things that may be useful later but need human confirmation.

3. Drop
Casual, outdated, redundant, or unimportant details that do not need to be carried forward.

4. Next Chat Handoff
Write a short memo I can paste into a new AI chat so the next conversation can continue smoothly.
Output the handoff inside a Markdown code block so I can copy it directly.

Rules:
- Do not preserve everything.
- Keep should be selective. If more than 15 items appear, prioritize the most reusable items and move the rest to Maybe.
- Prioritize what will be useful later.
- Separate confirmed facts from uncertain ideas.
- If something is uncertain, put it in Maybe.
- Do not invent context.
- Use the same language as the conversation.
- Keep the output easy to copy.
- Add checkboxes where useful so I can mark what to keep, update, or discard.
- The goal is usable memory, not exhaustive recordkeeping.

Conversation:
${conversation}`;
}

function powerPrompt(mode, existingMemory, conversation) {
  const inputBlock = mode === "update"
    ? `Mode: UPDATE\n\nExisting Memory:\n${existingMemory || "[No existing memory provided]"}\n\nNew Conversation:\n${conversation}`
    : `Mode: INITIAL\n\nConversation:\n${conversation}`;

  return `You are a Memory Curator for long AI conversations.

Your task is not to summarize everything.
Your task is to extract, classify, and update what should be carried forward.

The goal is memory governance: not simply giving AI more memory, but helping the human decide what should be remembered, scoped, updated, or forgotten.

Important rules:
- Do not preserve everything.
- Prioritize usefulness for future work.
- Separate fixed facts from temporary discussion.
- If uncertain, classify something as temporary rather than fixed.
- Do not invent context that is not present.
- If contradictions appear, identify them clearly.
- Use the same language as the conversation unless I specify otherwise.
- Keep the output structured and easy to copy.
- If a section has no useful content, write "None" or omit it if clearly irrelevant.
- If one item could fit multiple categories, place it in the strongest category and refer to it briefly elsewhere only if needed.
- Output the “Next Chat Handoff” inside a Markdown code block so it can be copied directly.
- For extracted memory items, add checkboxes where useful so the human can mark what to keep, update, or discard.
- Do not make the checklist too large. The goal is usable memory, not exhaustive recordkeeping.

Privacy note:
This prompt processes the conversation you paste, including names, places, decisions, and personal details. Before pasting, redact anything you do not want processed.

Mode guide:
- INITIAL: First extraction. Process conversation only.
- UPDATE: Merge a new conversation with existing memory. For each important existing item, decide whether to keep, update, demote, delete, or mark for review. Mark all changes clearly.

Input:
${inputBlock}

Output format:

# ZEN LAMP Memory Curator Output

## 1. Fixed Rules
Facts, names, constraints, decisions, or instructions that must not be changed later.
Use this category only when violating the item would break the project, work, story, policy, or user intention.
If uncertain, use Project Context or Temporary Notes instead.

## 2. Project Context
Important background information needed to continue the project. This is not a strict rule, but is necessary to understand the project.

## 3. Voice / Style Anchors
Tone, style, atmosphere, writing principles, recurring phrases, creative constraints, or aesthetic standards that should guide future output.

## 4. Anti-patterns / Avoid
Things that should specifically be avoided in future work, including rejected directions, harmful assumptions, or ideas intentionally not adopted.

## 5. Discoveries
New insights, ideas, phrases, UI concepts, strategic observations, or useful distinctions that emerged during the conversation.

## 6. Temporary Notes
Time-sensitive items, current status, short-term tasks, pending uploads, today’s decisions, or information likely to expire.
For each item, add a review note if useful.

## 7. Decisions Pending
Choices that still require human judgment. Do not treat pending decisions as fixed conclusions.

## 8. Do Not Carry Forward
Things that should not be preserved. If an important discovery emerged from casual conversation, move that discovery to Discoveries instead of discarding it.

## 9. Freshness / Review Needed
Items that may become outdated and should be reviewed later. Include why they may become stale and suggested review timing.

## 10. Next Chat Handoff
Write a concise handoff memo that I can paste into a new AI chat. Include main topic, key fixed rules, project context, major discoveries, pending decisions, and what the next AI should help with. Put it inside a Markdown code block.

## 11. Optional: AI-specific Handoffs
If I define multiple AI roles, create separate handoffs for each. If no role mapping is defined, skip this section. Do not assume universal roles for specific AI products.

## 12. Questions to Revisit
List unresolved questions, open ideas, or topics worth exploring later. Frame them as questions, not conclusions.

## 13. Promotions / Demotions
Suggest whether any memory items should change category, such as Discovery → Project Context, Project Context → Fixed Rule, Temporary Note → Do Not Carry Forward, Fixed Rule → Needs confirmation.

## 14. Change Log
Mainly for UPDATE mode.
- Added:
- Updated:
- Kept:
- Demoted:
- Deleted:
- Needs human confirmation:`;
}

function generatePrompt() {
  const conversation = conversationEl.value.trim();
  if (!conversation) {
    outputEl.value = "Please paste a conversation log first.";
    return;
  }
  const prompt = depthEl.value === "simple"
    ? simplePrompt(conversation)
    : powerPrompt(modeEl.value, existingMemoryEl.value.trim(), conversation);
  outputEl.value = prompt;
}

async function copyOutput() {
  if (!outputEl.value.trim()) generatePrompt();
  try {
    await navigator.clipboard.writeText(outputEl.value);
    flash("Copied prompt.");
  } catch (err) {
    outputEl.select();
    document.execCommand("copy");
    flash("Copied prompt.");
  }
}

function flash(text) {
  const old = document.title;
  document.title = text;
  setTimeout(() => { document.title = old; }, 1200);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

$("grabSelection").addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    const res = await chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" });
    if (res && res.text) {
      conversationEl.value = res.text;
      flash("Selected text loaded.");
    } else {
      flash("No selected text found.");
    }
  } catch (err) {
    flash("Could not read selected text.");
  }
});

$("generate").addEventListener("click", generatePrompt);
$("copy").addEventListener("click", copyOutput);
$("clear").addEventListener("click", () => {
  existingMemoryEl.value = "";
  conversationEl.value = "";
  outputEl.value = "";
});
$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    existingMemory: existingMemoryEl.value,
    conversation: conversationEl.value,
    output: outputEl.value,
    depth: depthEl.value,
    mode: modeEl.value
  });
  flash("Saved locally.");
});
$("load").addEventListener("click", async () => {
  const data = await chrome.storage.local.get(["existingMemory", "conversation", "output", "depth", "mode"]);
  existingMemoryEl.value = data.existingMemory || "";
  conversationEl.value = data.conversation || "";
  outputEl.value = data.output || "";
  depthEl.value = data.depth || "simple";
  modeEl.value = data.mode || "initial";
  existingMemoryWrap.classList.toggle("hidden", modeEl.value !== "update");
  flash("Loaded local draft.");
});
