# Brightloop

Brightloop is a fictional AI app builder whose marketing team watches real competitors (Lovable, Replit, Bolt, v0, Codex, Claude Code). This project builds a tool for one of its marketers.

## Language

**Marketer**:
One of the three Brightloop marketers (maya, daniel, noa) interviewed in the chat; the tool is built for exactly one of them.
_Avoid_: user, customer, stakeholder

**Competitor**:
A real company Brightloop competes with, whose public activity the tool watches.
_Avoid_: rival, vendor

**Signal**:
One observed event about a competitor, of type pricing, ad or launch, taken from one source.
_Avoid_: event, alert, news

**Source**:
The public place a signal was observed, such as a pricing page, an ad library or a social post.
_Avoid_: feed, channel (channel is reserved for an ad's platform)

**Trust level**:
How far a signal's source can be trusted (the competitor's own pricing page, its own site, known press, a guest post, a sponsored, anonymous or second-hand source, an unknown source); it sets an item's starting confidence, and whether a pricing claim can become an item at all.
_Avoid_: credibility, reputation

**Item**:
A recommendation to the marketer built from one or more signals, or from a baseline, with a next action, a reason and a confidence.
_Avoid_: alert, insight, card

**Promotion**:
A temporary price or offer on a competitor's pricing page (a promo link, an expiry date, an introductory price, "limited time" or discount wording); never a list-price change. A **possible promotion** has only hints (fine print, a bare percentage, "free forever"), so the item names the check still needed.
_Avoid_: deal, price cut

**Own pricing**:
Brightloop's own tiers and monthly prices, kept by the marketer in the own-pricing tab of their sheet and read only at run time; an item names the Brightloop tier it is compared with, never its price.
_Avoid_: our prices, sample prices

**Lowest paid tier**:
A competitor's cheapest paid plan, where most Brightloop trials compare; a list-price change to it, or less included on the free plan, is put to the marketer as "your call before 11:00" with the facts ("can't tell yet" without the own-pricing comparison); the tool never makes that call. More for the same price there is watched for two weeks.
_Avoid_: entry tier, starter tier

**Snapshot**:
The visible text and pricing facts of one competitor page as captured by one run; the next run compares against the latest one.
_Avoid_: copy, capture, cache

**Baseline**:
The first snapshot of a page, recorded when no earlier one exists; it yields an item stating current pricing, with no change.
_Avoid_: initial state, seed

**Snapshot diff**:
The changed lines between a page's latest snapshot and the one before it, each classified as price, limit, free plan, plan name, promotion marker or copy only; only these lines are judged.
_Avoid_: delta, patch

**Replay**:
A run over snapshots already stored, the latest two of each page, with no browser and no keys; in the tests, a real snapshot paired with an edited copy of it (a derived fixture).
_Avoid_: mock run, simulation

**Skipped signal**:
A signal that did not become part of any item, recorded with the reason.
_Avoid_: dropped, filtered, ignored

**Trap**:
Something the assignment brief's authors planted where the obvious, literal or AI-default response gives a worse result and a better move exists; listed in `SPOTTED.md`.
_Avoid_: gotcha, edge case (an edge case only needs careful handling, nothing invites the wrong move)

**Run**:
One execution of the tool over a set of signals, producing items, skipped signals and a log entry.
_Avoid_: job, batch
