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

**Item**:
A recommendation to the marketer built from one or more signals, with a next action, a reason and a confidence.
_Avoid_: alert, insight, card

**Skipped signal**:
A signal that did not become part of any item, recorded with the reason.
_Avoid_: dropped, filtered, ignored

**Run**:
One execution of the tool over a set of signals, producing items, skipped signals and a log entry.
_Avoid_: job, batch
