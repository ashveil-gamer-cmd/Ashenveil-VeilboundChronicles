# Ashenveil: Veilbound Chronicles

A browser-based ARPG built in vanilla HTML/CSS/JavaScript.

Play it here (once GitHub Pages is enabled): **https://YOUR-USERNAME.github.io/ashenveil/**

## File Structure

The game is split into 6 files. When working with Claude, paste only the file(s) relevant to what you want to change.

| File | Purpose | When to edit |
|------|---------|--------------|
| `index.html` | Page shell, UI panels, script loading order | New panels, new DOM elements, layout changes |
| `styles.css` | All visual styling | Colors, fonts, layout, animations |
| `data.js` | Constants, zones, enemy types, formulas | Balance tuning, new enemies, new zones, leveling curves |
| `audio.js` | Sound effects & music | Adding SFX, music tracks |
| `systems.js` | Gear system + Professions | New items, set bonuses, crafting recipes |
| `game.js` | Main engine — loop, combat, rendering, input | Core gameplay changes, new abilities, VFX |

**Script load order matters:** `data.js` → `audio.js` → `systems.js` → `game.js`. This is already set in `index.html`.

## Working With Claude

Tell Claude *what* you want changed, not *which* file. Claude will tell you which file to paste. Examples:

- "Hollowcaller feels weak" → paste `data.js`
- "The shop UI is ugly" → paste `styles.css` + `index.html`
- "Add a fire dungeon" → paste `data.js`
- "Combat feels floaty" → paste `game.js`
- "I want a save system" → Claude will create a new `save.js`

Claude returns only the file(s) that changed. You replace them in your repo.

## Running Locally

Because the game uses separate JS files, you can't just double-click `index.html` in some browsers (CORS blocks file:// loads). Serve it with any tiny web server:

```bash
# Python
python3 -m http.server 8000

# Then open http://localhost:8000
```

Or just push to GitHub and use GitHub Pages — easier.
