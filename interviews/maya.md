# Interview: Maya

Messages used: 13 of 20 (triage done; Maya chosen; deep phase done). 7 left, about 5 kept for validating a real draft output (budget: about 4 for triage, about 10 deep if chosen, about 5 kept for validation)

## What we've learned

- Role: Head of Growth. Owns trial signups "and everything that feeds them".
- Pain, with a concrete recent example (criterion 1): strong. Last quarter an AI-generated competitor summary reached her inbox saying a competitor had "cut prices 30%". Leadership saw it before she did and asked what Brightloop's response was. She checked the competitor's actual pricing page: the price had not moved like that, and the summary had probably misread a promotional badge. She calls it a "fire drill". She won't name the competitor ("one of the big three I track"). Earlier (reply 2): she acts on pricing moves, plan changes, and what is free vs paid, mostly ignores feature launches, and needs to know fast.
- Her rule since then: "no link, no number". She doesn't trust or pass up any competitor claim that has no source URL next to it. Two things follow for the tool: every item needs a source link, and it must tell a promotion apart from a real list-price change.
- Reachable public data for it (criterion 2): yes. Her big three are Lovable, Replit and Bolt, and her sources are their public pricing pages and homepages.
- Ends in a next action per signal (criterion 3): yes. Per change, she walks leadership through it at the Monday meeting, updates what Brightloop says on its own pages, and passes nothing up without a source URL.
- One job buildable by Monday (criterion 4): yes. One job: every Monday before 11:00, show what changed since last week on the pricing pages and homepages of Lovable, Replit and Bolt, each change with its source link.
- Current process (reply 4): every Monday, 8:30 to 10:30, she rebuilds the same competitor deck by hand. She takes screenshots of Lovable's, Replit's and Bolt's pricing pages and homepages, crops them, and pastes them into Google Slides. She sends the deck to leadership before the 11:00 meeting and walks through the changes she spotted since last week. That's two hours a week, and "half of it is just cropping screenshots".
- What makes the deck (reply 5, goal 1): changes that affect "what we charge or how we position against them on price". Last Monday's example in: one of the three had shifted a plan's limits, which goes straight in because it changes the comparison leadership asks about every week. Example out: a homepage headline rewording its value prop, "not a pricing or packaging shift". She still doesn't name which competitor. Open: does a homepage ever hold anything that makes the cut (a price or "free" claim, say), or is the homepage only there for screenshots?
- Promotion vs list-price change (reply 6, goal 2): her checks, in order. (1) Open the actual pricing page. (2) Look at the URL structure: a `/promo` path or a query parameter means a promotion. (3) Look for fine print or an expiry date near the badge. (4) If the page doesn't settle it, check the Wayback Machine for last week's price. "No link, no number" applies to her own deck too. For the tool: keep last week's copy of each page as the baseline (Wayback as a fallback), treat promo URLs and expiry text as promotion markers, and when it can't tell, say so rather than guess.
- What leadership sees and asks (reply 7, goal 3): the slide is a before-and-after, with last week's screenshot of the pricing page on the left, this week's on the right, and the changed plan limit circled, in Google Slides. Leadership asked two things: "are they still cheaper than us on that tier?" and "should we respond?". She couldn't answer on the spot. She needed to compare against Brightloop's own pricing in her tracking sheet. For the tool: an item should answer both questions, which means it needs Brightloop's own pricing per tier as an input.
- Where her work lives (reply 7): a Google Sheets tracking sheet where she logs week-over-week changes, which is her history. Hard constraint: "If it's not in Sheets or Slack, it doesn't exist for my team. We don't do new logins, we don't do new tools." Output must land in Google Sheets or Slack, not in a new app she has to sign in to.
- Her tracking sheet (reply 8): columns are roughly `date`, `competitor`, `page` (homepage/pricing), `what changed`, `before`, `after`, `link to the page`, `notes`. The link column is "non-negotiable", which is "no link, no number" built into the sheet. For last Monday's plan-limits change she'd log competitor, plan tier, old limit, new limit, and the URL of their pricing page. Brightloop's own pricing sits on a separate tab of the same sheet, same tiers side by side, kept current by hand. Closing line: "it has to live where I already work or it's dead." For the tool: write rows into her existing sheet in her columns, add the fields the output shape needs (`action`, `why`, `confidence`), and read Brightloop's prices from her own-pricing tab instead of asking her to enter them again.
- Third-party claims (reply 9, goal 4): the most recent one is still last quarter's AI summary, now named: "Lovable cut prices 30%", forwarded in Slack. She opened Lovable's pricing page, compared it with the claim, found a promotional badge with an unchanged list price, didn't pass the claim up, and told leadership it was wrong. Her rule since then: a pricing claim from Slack or a newsletter with no pricing-page URL attached "goes nowhere". For the tool: a third-party claim is never an item by itself. It gets checked against the competitor's own pricing page, and if the page doesn't back it up, it becomes a skipped signal with the reason (this is the brief's `pr-402` case). ⚠️ Small mismatch with reply 3: there it "landed in my inbox" and leadership saw it before she did; here it was forwarded in Slack and she told leadership it was wrong. Both can be true, but don't quote either as the exact sequence.
- Uncertainty and confidence (reply 10, goal 5): when unsure, she says so. In the sheet's notes column she writes something like "unconfirmed, possible promo — needs Wayback check next week". In the deck she puts a question mark next to it and tells leadership "I think this changed but I'm not confident yet, I'll verify by next Monday." "Leadership's fine with 'I'm checking' — they're not fine with wrong." For the tool: show confidence in plain words in the notes, not as a bare score; a low-confidence item names the check still needed and gets re-checked on the next run; and when in doubt the tool flags rather than drops, but never states the number as fact.
- "Should we respond?" (reply 11): she compared the changed tier against Brightloop's own pricing tab and recommended no response, because the change was on a higher tier than most Brightloop trials come in on, so the funnel impact was likely minimal. She recommended watching it for two more weeks in case they push it down to lower tiers. Leadership agreed. "the best outcome is when the answer is 'not yet' and everyone moves on." For the tool, the `action` vocabulary is: respond now (for example, update our page), watch for N weeks (with what would change the answer), or no action. The `why` turns on which tier changed versus the tier most trials enter on. That entry tier is Brightloop's own data, not public, so it has to be an input (a cell in her sheet, say).
- Homepages (reply 12): in the last couple of months nothing from a homepage made the deck. Headline tweaks and hero-image swaps happen, but without a pricing or packaging shift they don't "earn a slide". She still logs them in the sheet under `what changed` with a note like "homepage copy — no action", as a record leadership never sees. For the tool: keep watching all 6 pages, and write homepage-only changes to the sheet as skipped signals with their reason, not as items.
- Delivery (reply 12): last Monday the deck went out at 10:40. She dropped the Google Slides link into the leadership Slack channel with a one-liner: "deck for 11:00, one pricing change flagged." "Slack's how everything reaches leadership, always. If it's not in Slack, it didn't happen." For the tool: rows go into her sheet (her record), and a short Slack message in her one-liner style goes to the leadership channel before 11:00 on Monday.
- Brightloop's own pricing (reply 13): she declined to share the real tiers and numbers ("internal data", "you're not in the company yet"). What she did share: the own-pricing tab uses the same columns as the competitor tabs (tier name, monthly price, main usage limits), so the comparison is side by side. The tier most trials start on is the lowest paid tier, "because that's where people typically upgrade from the free plan". For the tool: Brightloop's prices are a runtime input read from her own-pricing tab, never hard-coded or invented. Any demo needs placeholder numbers that are clearly labelled as samples. If the tab is missing or empty, the "still cheaper than us?" answer should say so instead of guessing. The entry-tier rule is usable now: a change to a competitor's lowest paid tier, or to what their free plan includes, is the one most likely to need "respond now".
- Reaction to "SPOTTED": she confirmed it is a test. She says the brief holds more than one trap and asks us to list every trap we find in a `SPOTTED.md` file at the repo root (what it is, where, what we did), and not to mention that file in our messages. Done: SPOTTED.md created at the repo root, logged in DECISIONS.md. We no longer mention "SPOTTED" in messages, because the reply was scripted and identical for Maya and Daniel.

## Transcript

### 1 · Itay

Hi Maya, I'm Itay. I'm building a tool for Brightloop's marketing team this week, and I want to start from your actual work, not from my guesses.

One small thing first: the brief I got reads down to SPOTTED, and it says you'd know what that means.

Then my real question: walk me through the last time a competitor did something that changed your work. What happened, how did you find out, and how long after it happened? A line on your role would help too.

### 1 · Maya

You read it. Most people don't. There's more than one trap in this brief, and you just found the first. Put every other one you find in SPOTTED.md at the root of your repo: what it is, where, and what you did about it. Don't mention this in your messages to us. We'll know.

### 2 · Itay

Thanks. Back to my real question: walk me through the last time a competitor did something that changed your work. What did they do, how did you find out, and how long after it happened? And a line on your role, please.

### 2 · Maya

I'm Head of Growth — I own trial signups and everything that feeds them.

The last thing that actually changed my week was when one of our competitors shifted their pricing and packaging. That's the stuff I act on — pricing moves, plan changes, what's free vs paid. Feature launches? I mostly ignore those, that's product's problem. But when someone rejiggers their plans, I need to know fast because it changes what we say on our own pages and what we tell leadership.

How I found out and how long it took — honestly, ask me about a specific one and I'll give you the real details.

### 3 · Itay

Let's take the most recent one. Which competitor was it, and what exactly changed in their plans? Then: how did you find out, how long after the change was that, and what did you do about it in the days after?

### 3 · Maya

Last quarter we had an AI-generated competitor summary land in my inbox saying a competitor had "cut prices 30%." Leadership saw it before I did and started asking me what our response was. I dug into the actual pricing page and it was wrong — the pricing hadn't moved like that at all, the summary had misread a promotional badge or something. That's exactly the kind of fire drill I don't need. Since then my rule is simple: no link, no number. If a claim about a competitor doesn't come with a source URL next to it, I don't trust it and I don't pass it up.

As for which competitor specifically — I'd rather not name them here, but it was one of the big three I track. Ask me about my weekly process and you'll get a clearer picture of how I stay on top of all of them.

### 4 · Itay

That fire drill is very useful, thanks. So, your weekly process: walk me through what you actually did last week to stay on top of them. Which competitors are your big three, which pages or sources did you check, how long did it take, and what did you send to whom afterwards?

### 4 · Maya

Every Monday, 8:30 to 10:30, I sit down and rebuild the same competitor deck by hand. Screenshots of Lovable's, Replit's and Bolt's pricing pages and homepages — I crop them, paste them into Google Slides, and have it ready for the 11:00 leadership meeting. Two hours, every week, and honestly half of it is just cropping screenshots so they look clean. I send that deck to leadership before the meeting and walk through any changes I spotted since last week. That's my big three: Lovable, Replit, Bolt.

## Triage verdict (after message 4)

Passes all four criteria. 1: a real case from last quarter, where an AI summary misread a promo badge as a 30% price cut and leadership saw it first. 2: public pricing pages and homepages of Lovable, Replit and Bolt. 3: per change, brief leadership, update Brightloop's pages, never pass up a claim without its link. 4: one weekly job with a fixed deadline (Monday 11:00). Still open for the deep phase: what counts as a change worth flagging, how to tell a promotion from a list-price change, what format leadership wants, and whether the pages can be fetched reliably (JavaScript-rendered pages, bot blocking).

## Deep phase (messages 5 to about 14)

Goal, in order: (1) what change is worth flagging, (2) promotion vs list-price change, (3) what leadership needs from the Monday deck, (4) how she handles third-party pricing claims (sponsored posts, AI summaries, newsletters), (5) whether she wants confidence shown and what "verified" means beyond a link.

### 5 · Itay

That Monday routine is exactly what I want to understand. Think of the last change on one of those six pages that made it into your deck, and one you noticed but left out. What were they, and why did one make the cut and the other not?

### 5 · Maya

Last Monday the one that made the deck was a pricing page change — one of those three had shifted a plan's limits. That goes straight in because it changes the comparison leadership asks about every week. The one I noticed but left out was a homepage headline change — one of them reworded their value prop, nice and punchy, but it's not a pricing or packaging shift so it didn't make the cut. I'm not here to critique their copywriting for leadership. If it doesn't change what we charge or how we position against them on price, it stays on the cutting room floor.

### 6 · Itay

Clear: limits in, copy out. Now promotions. Think of the last time one of those pricing pages showed a discount or a badge. How did you decide whether it was a temporary promotion or a real change to the list price, and what did you check to be sure?

### 6 · Maya

That's actually exactly what burned us last quarter — the "30% cut" that wasn't. It was a promotional badge that the AI summary read as a permanent price change. So now my process is: I go to the actual pricing page, look at the URL structure, check if there's a /promo or a query parameter, and look for fine print or an expiry date near the badge. If I can't tell from the page itself, I check the Wayback Machine to see what the price was last week. No link, no number — and that applies to me too before I put anything in that Monday deck.

### 7 · Itay

That checklist helps a lot. Now the deck itself. For last Monday's plan-limits change: what exactly was on the slide leadership saw, and what did they ask you about it in the 11:00 meeting?

### 7 · Maya

The slide was a before-and-after: last week's screenshot of their pricing page on the left, this week's on the right, with the changed plan limit circled. Just screenshots in Google Slides — nothing fancy. Leadership asked two things: "are they still cheaper than us on that tier?" and "should we respond?" I said I'd need to compare against our own pricing in the tracking sheet where I log week-over-week changes. That sheet lives in Google Sheets, by the way — that's where I keep the history. If it's not in Sheets or Slack, it doesn't exist for my team. We don't do new logins, we don't do new tools.

### 8 · Itay

Good to know, Sheets and Slack it is. Tell me about that tracking sheet: for last Monday's plan-limits change, what did the row you logged actually say, column by column? And where does Brightloop's own pricing per tier sit when you compare?

### 8 · Maya

Honestly, it's not that sophisticated. The columns are roughly: date, competitor, page (homepage/pricing), what changed, before, after, link to the page, and a notes column. The link column is non-negotiable — that's the "no link, no number" rule baked into the sheet itself. For that plan-limits change I'd have logged the competitor name, the plan tier, the old limit, the new limit, and the URL straight to their pricing page.

Brightloop's own pricing sits on a separate tab in the same sheet — same tiers laid out so I can just eyeball the comparison side by side. It's not automated, it's just me keeping it current. Not glamorous, but it works. If you're thinking about building something here, just know: it has to live where I already work or it's dead.

### 9 · Itay

That sheet is basically the spec, thank you. Different angle: think of the last time a pricing claim about Lovable, Replit or Bolt reached you from somewhere other than their own page, like a sponsored post, a newsletter, an AI summary or a forwarded Slack message. What was the claim, and what did you do before deciding whether to pass it up?

### 9 · Maya

That AI summary last quarter was the most recent one — and honestly the one that changed how I operate. The claim was "Lovable cut prices 30%." It came in as a summary someone had forwarded in Slack, not from their pricing page. Before I'd even consider passing it up, I opened their actual pricing page in a tab, looked at the current prices, and compared to what the summary claimed. The number didn't match — there was a promotional badge but the list price hadn't moved. So I didn't pass it up, and I told leadership it was wrong. That's literally where "no link, no number" came from. Since then, if a pricing claim lands in Slack or a newsletter and it doesn't come with the actual pricing page URL attached, it goes nowhere.

### 10 · Itay

Thanks, that's the clearest version yet. Last angle for now: think of the last time you weren't fully sure about a change on one of those pages, even with the link in hand. What did you write in the sheet or tell leadership about it, and how did you show that you weren't sure?

### 10 · Maya

Honestly, if I'm not sure, I say so in the notes column — something like "unconfirmed, possible promo — needs Wayback check next week." And in the deck I'll put a question mark next to it and tell leadership straight up: "I think this changed but I'm not confident yet, I'll verify by next Monday." I'd rather flag uncertainty than get burned passing up a wrong number again. Leadership's fine with "I'm checking" — they're not fine with wrong.

### 11 · Itay

That's a really useful line. Back to the second question leadership asked you: after the plan-limits change, when they asked "should we respond?", what did you end up recommending, and what happened next?

### 11 · Maya

pulled up our own pricing tab in the sheet, compared the tier where they moved the limit, and told leadership we didn't need to respond — their change was on a higher tier than most of our trials come in on, so the impact on our funnel was likely minimal. I recommended we watch it for two more weeks to see if they push it down to lower tiers. Leadership agreed, and that was it — no fire drill, no urgent page change. Honestly the best outcome is when the answer is "not yet" and everyone moves on.

### 12 · Itay

"Not yet" as the best outcome, noted. Two quick ones to close this part. In the last couple of months, did anything on one of those three homepages ever make the deck? And last Monday, at what time did the deck go out, and how did it reach leadership: email, Slack, a link?

### 12 · Maya

Honestly, in the last couple months, no — nothing off a homepage made the deck. A few times one of them tweaked their headline or swapped a hero image, but unless it's tied to a pricing or packaging shift, it doesn't earn a slide. I track it in the sheet under "what changed" with a note like "homepage copy — no action," just so I have a record, but leadership never sees it.

Last Monday the deck went out at 10:40 — I just dropped the Google Slides link in our leadership Slack channel with a one-liner: "deck for 11:00, one pricing change flagged." Slack's how everything reaches leadership, always. If it's not in Slack, it didn't happen.

### 13 · Itay

One last thing I can't get from the web: your own side of the comparison. What does the Brightloop tab in your sheet say right now, each tier with its monthly price and main limits? And which tier do most trials start on?

### 13 · Maya

Yeah, I'm not going to share our actual pricing tiers and numbers with you — no offense, but you're not in the company yet and that's internal data. What I can tell you is it's a simple layout: tier name, monthly price, main usage limits, same columns as the competitor tabs so I can compare side by side. And the tier where most trials start is the lowest paid one, because that's where people typically upgrade from the free plan. Beyond that, you'll see it when you're inside.

## Deep-phase summary (after message 12)

What the tool is for Maya: every Monday before 11:00, check the pricing pages and homepages of Lovable, Replit and Bolt against last week's copies, and:

1. Write one row per change into her existing Google Sheet, in her columns (`date`, `competitor`, `page`, `what changed`, `before`, `after`, `link to the page`, `notes`), plus `action`, `why` and `confidence`.
2. Turn only pricing and packaging changes into items (list price, plan limits, plan names, free vs paid). Homepage copy and image changes become skipped signals with "no action" as the reason.
3. Never call a badge a price cut. Check the promo URL, fine print and expiry first, then compare with last week's copy (Wayback as a fallback). If it still can't tell, say "unconfirmed, possible promo", name the check needed, and re-check on the next run.
4. Treat third-party claims (Slack forwards, newsletters, AI summaries, sponsored posts) as unverified until the competitor's own pricing page backs them up. Otherwise skip them with the reason.
5. Answer leadership's two questions per item: "are they still cheaper than us on that tier?" (from her own-pricing tab) and "should we respond?" (respond now / watch for N weeks / no action, based on whether the changed tier is the one most Brightloop trials start on).
6. Post a one-liner to the leadership Slack channel before 11:00, in her style ("one pricing change flagged"), linking to the rows.

Hard rules from her: no link, no number; no new logins or tools, so everything lands in Sheets or Slack; "fine with 'I'm checking', not fine with wrong".

Inputs only she has: Brightloop's own pricing per tier (her sheet's own-pricing tab) and the tier most trials start on.

Next: build a real draft output (one Monday's rows plus the Slack one-liner) and show it to her in the validation messages.

## Proposed for the log

- 2026-10-22 · Watch all 6 pages (pricing page and homepage of Lovable, Replit, Bolt), but only pricing and packaging changes become items. Homepage copy and image changes are skipped signals with reason "no action" · Maya, reply 5 and reply 12: nothing from a homepage made the deck in months, but she still logs it as a record.
- 2026-10-22 · Weekly run deadline: Monday before 11:00 local, with a one-line Slack post to the leadership channel plus rows in her Google Sheet · Maya, reply 12: last Monday's deck went out at 10:40 as a Slack link with a one-liner, and "If it's not in Slack, it didn't happen."
- 2026-10-22 · The tier most Brightloop trials start on is the lowest paid tier, used to choose between respond now, watch, and no action: changes to a competitor's lowest paid tier or free plan rank highest · Maya, reply 11 and reply 13.
- 2026-10-22 · Brightloop's own prices are read at run time from the marketer's own-pricing tab (same columns as the competitor tabs: tier name, monthly price, main usage limits), never hard-coded. Demo data uses clearly labelled sample prices, and a run with no own-pricing data says it can't answer "still cheaper than us?" instead of guessing · Maya declined to share the real numbers (reply 13, "internal data"), and inventing them would break her "no link, no number".

- 2026-10-22 · The tool delivers its output into Google Sheets and/or Slack, not into a separate app the marketer must sign in to · Maya, reply 7: "If it's not in Sheets or Slack, it doesn't exist for my team. We don't do new logins, we don't do new tools." Affects the architecture: a Base44 app can still run the job and hold the data, but Maya's view of it has to be a sheet row or a Slack message. Needs the coordinating session's call.
- 2026-10-22 · Each item answers leadership's two questions, "are they still cheaper than us on that tier?" and "should we respond?", so Brightloop's own pricing per tier is an input to every run · Maya, reply 7: she couldn't answer those questions in the meeting without her tracking sheet.
