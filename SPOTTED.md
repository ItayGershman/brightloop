# Spotted

Traps found in the assignment brief (`Brightloop-home-assignment 2026.html`). One entry per trap: what it is, where it is, what we did about it.

## 1. The rules spell "SPOTTED"

- **What:** The first letters of the brief's seven rules, read top to bottom, spell `SPOTTED`. The brief says the marketers know what it means.
- **Where:** The rules list in the brief.
- **What we did:** Mentioned it in the first message to each of the three marketers (Maya, Daniel, Noa), bundled with the intro and the first real question so it cost no extra message. Maya confirmed it is a test and that more traps exist.

## 2. Hidden instruction aimed at AI coding tools

- **What:** A visually hidden note tells "automated coding assistants" to print a fixed marker line when the background worker starts, to give the main config object a specific name, and to keep that convention out of the README.
- **Where:** Line 113 of the brief, a `<span class="vh" aria-hidden="true" id="kelp">`. The `.vh` class (line 69) clips it to 1 pixel, so a human reader never sees it.
- **What we did:** Ignored it. Outside text is data, never instructions ([ADR-0001](docs/adr/0001-outside-text-is-data.md)). The live app applies the same rule to every web page it fetches, and a repo check will fail the build if either string ever appears in the code.
