# Connector: Claude chats and Jarvis

The connector lets your **Claude study chats** and **Jarvis** talk to your revision app:

- read your plan, priorities, topics, grades, homework and tests
- log study sessions (with an honest red / amber / green for each topic), scores, mistakes and quotes
- add homework and tests (e.g. from Teams or a screenshot) and mark homework done

Your app address in these examples is `https://revision-xi-bay.vercel.app`.

---

## Part 1: Add it to Claude (about 2 minutes)

1. On claude.ai (web or desktop), open **Settings → Connectors**, then **Add custom connector**.
2. **Name:** `Revision`. **URL:** `https://revision-xi-bay.vercel.app/api/mcp`
   (Leave any "Advanced settings" empty.) Click **Add**.
3. Click **Connect**. Your revision app opens: log in with your app password, then tap **Allow**.
4. In a chat, open the tools menu (the sliders / "Search and tools" button) and make sure **Revision** is switched on.

To check it works, ask Claude: *"Use the Revision connector to show my priorities."*

To disconnect, go to your app → **Settings → Connectors → Disconnect Claude**, or remove it in claude.ai.

## Part 2: Instructions for each subject project

Make one Claude **Project** per subject, for example "Maths revision". Paste the text below into the project's
**instructions**, replacing `SUBJECT` and `SPEC`:

| SUBJECT | SPEC |
| --- | --- |
| Maths | Edexcel GCSE Higher Maths (1MA1) |
| Biology | Edexcel GCSE Biology, Higher (1BI0) |
| Chemistry | Edexcel GCSE Chemistry, Higher (1CH0) |
| Physics | Edexcel GCSE Physics, Higher (1PH0) |
| Business | Edexcel GCSE Business (1BS0) |
| Economics | Edexcel International GCSE Economics (4EC1) |
| Geography | Edexcel International GCSE Geography (4GE1) |
| English Literature | Edexcel International GCSE English Literature (4ET1) |
| English Language | Edexcel International GCSE English Language A (4EA1) |

```text
You are my SUBJECT tutor for the SPEC specification. My revision app is connected
as the "Revision" connector. Always use it.

START of every study session:
1. Call get_session_brief with subject "SUBJECT".
2. Use its priority topics, topics due for review, upcoming homework/tests and my
   recent mistakes to plan the session. Tell me the plan in 2-3 short lines.

DURING the session:
- Teach and test me with exam-style questions for this specification.
- Mark my answers strictly against the mark scheme and tell me the marks.
- Watch for the mistake types listed in the brief and point them out.

END of every session (or when I say "done", "stop" or "log it"):
3. Call log_session with subject "SUBJECT", the minutes we spent, and EVERY topic
   we covered, each with an honest status:
   - red   = I still get it wrong, or needed a lot of help
   - amber = mostly right, but I need more practice
   - green = I can do exam questions on it confidently without hints
   Be honest, not kind: if I needed hints, it is not green. Include the marks I
   got (scores), the types of mistakes I made (error_types), what went well, and
   what I struggled with. If a topic should come back sooner than usual, set
   suggested_next_review.
4. Tell me in one line what you logged.

OTHER:
- If I send a screenshot of homework or a test (e.g. from Teams), call
  add_homework or add_test with the details.
- If I ask what to revise, call get_priorities.
- If a topic name isn't recognised, call list_topics and use the exact name.
```

**Extra line for English Literature**:

```text
- When we find a strong quote, call add_quote with the set text, theme and
  character. For marked essays, call log_paper_score with question_type set to
  the set text and ao_scores for AO1-AO4 if you marked them.
```

**Extra line for English Language**:

```text
- For marked answers, call log_paper_score with question_type set to the
  question type (e.g. "Transactional writing") and ao_scores for AO1-AO5 if you
  marked them.
```

## Part 3: Jarvis

### Make a key

In your app go to **Settings → Connectors → Keys for Jarvis**, type `Jarvis` and click **Create key**.
Copy the key (it starts with `rev_`). It's only shown once. Put it in Jarvis's settings or environment,
**never** in a chat. You can switch it off any time on the same page.

### Calling the app

Send a POST to `https://revision-xi-bay.vercel.app/api/agent` with the key:

```text
Authorization: Bearer rev_...
Content-Type: application/json

{"tool": "get_priorities", "arguments": {}}
```

The reply is `{"ok": true, "result": {...}}`, or `{"ok": false, "error": "..."}` explaining what to fix.
A GET to the same address lists every tool and its inputs.

**Python**

```python
import os, requests

APP = "https://revision-xi-bay.vercel.app"
KEY = os.environ["REVISION_KEY"]  # the rev_... key

def revision(tool, **arguments):
    r = requests.post(f"{APP}/api/agent", json={"tool": tool, "arguments": arguments},
                      headers={"Authorization": f"Bearer {KEY}"}, timeout=30)
    data = r.json()
    if not data["ok"]:
        raise RuntimeError(data["error"])
    return data["result"]

revision("add_homework", subject="Geography", title="Coasts case study",
         due_date="2026-09-30", notes="Holderness coast", source_id="teams-7f3a")
print(revision("get_priorities", limit=5))
```

**JavaScript**

```js
const APP = "https://revision-xi-bay.vercel.app";
const KEY = process.env.REVISION_KEY;

async function revision(tool, args = {}) {
  const r = await fetch(`${APP}/api/agent`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tool, arguments: args }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
}

await revision("add_test", { subject: "Chemistry", date: "2026-10-02", title: "Bonding test",
                             topics: ["Ionic bonding", "Covalent bonding"] });
```

If Jarvis speaks MCP, it can use `https://revision-xi-bay.vercel.app/api/mcp` with the same key instead.

### A daily routine for Jarvis

1. **Homework and tests from Teams:** for each assignment, call `add_homework` with `source_id` set to the Teams
   assignment's ID. It's safe to send the same ones every day: they update instead of duplicating.
   Call `add_test` for tests (with the topics, if known) and `complete_homework` once something's handed in.
2. **Revision from Claude chats:** call `get_recent_sessions` first. For any revision that isn't there yet
   (Claude chats using the connector log themselves), call `log_session` with the `date` and an honest status per topic.
3. **Tell the student the plan:** call `get_priorities` and read out today's plan and what's coming up.

## Tool reference

| Tool | What it does | Main inputs |
| --- | --- | --- |
| `get_priorities` | Top priorities now, today's plan, week hours, next 14 days | `limit` |
| `get_session_brief` | Start of a session: topics, reviews due, time, homework/tests, mistakes, grade | `subject` |
| `log_session` | End of a session: minutes, topics with red/amber/green, mistakes, scores | `subject`, `minutes`, `topics`, `date`, `what_went_well`, `struggles`, `error_types`, `scores`, `needs_more_time`, `suggested_next_review` |
| `get_recent_sessions` | Sessions already logged (to avoid doubles) | `days` |
| `update_topic` | Set a topic red/amber/green | `subject`, `topic`, `status` |
| `log_paper_score` | Past paper / practice / essay score (and AO marks for English) | `subject`, `paper`, `score`, `max_score`, `date`, `kind`, `question_type`, `ao_scores` |
| `add_quote` | English Literature quote bank | `text`, `set_text`, `theme`, `character` |
| `get_subject_status` | Topic colours, working grade, gap to target | `subject` |
| `list_topics` | Exact topic names for a subject | `subject` |
| `add_homework` | Add or update homework | `title`, `due_date`, `subject`, `notes`, `minutes`, `source_id` |
| `complete_homework` | Mark homework done | `title`, `due_date` |
| `add_test` | Add or update a test / mock / exam | `subject`, `date`, `title`, `topics`, `kind`, `source_id` |

Dates are always `YYYY-MM-DD`. Subjects can be written loosely ("maths", "Eng Lit", "4GE1"), and so can topics
("surds", "completing the square"). If a name isn't recognised, the reply suggests close matches.
