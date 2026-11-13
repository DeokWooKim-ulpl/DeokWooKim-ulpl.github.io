# deokwookim-ulpl.github.io

Personal academic website of Deok Woo Kim — https://deokwookim-ulpl.github.io

Plain static HTML/CSS/JS served by GitHub Pages. No build step.

## Layout
| Path | Content |
|---|---|
| `index.html` | Home |
| `research/`, `publications/`, `cv/` | Main pages |
| `tools/<slug>/` | Calculators. `app.html` is the standalone tool, `index.html` wraps it in the site layout |
| `virtual-lab/<slug>/` | General-physics simulators (same structure as tools) |
| `assets/css/style.css`, `assets/js/site.js` | Shared style and scripts |

## Adding a tool
1. Make `tools/<slug>/` and put the standalone HTML in `app.html`.
2. Copy `index.html` from another tool folder and change the title, description, and breadcrumb.
3. Add a card to `tools/index.html`.
