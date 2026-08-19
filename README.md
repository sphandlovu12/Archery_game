# 🏹 Archery Challenge

A browser-based archery game where players control a bow, adjust their aim against dynamic wind, and compete for the highest score over 3 rounds.

No installation or server needed — just open `index.html` in a browser.

---

## How to Play

1. Open `index.html` in any modern browser
2. Choose your game mode: **vs AI** or **2 Players**
3. If playing vs AI, select a difficulty: Low, Medium, or High
4. Enter player names and click **Start Game**
5. Use the arrow keys to aim, watch the wind indicator, and fire

---

## Controls

| Key | Action |
|-----|--------|
| `↑ ↓ ← →` | Move aim crosshair |
| `Space` | Fire arrow |

You have **10 seconds** to aim each shot. If the timer runs out, the arrow fires automatically.

---

## Wind

Each round generates a random wind with:
- **Speed** — 0.1 (light breeze) to 5.0 (strong gust)
- **Direction** — any of 8 compass directions (↑ ↗ → ↘ ↓ ↙ ← ↖)

Wind deflects the arrow both **horizontally and vertically** on impact. The HUD shows the wind speed and direction arrow so you can compensate your aim.

Two crosshairs are shown while aiming:
- **White** — where you are pointing
- **Cyan** — where the arrow will actually land after wind drift

---

## Scoring

| Zone | Points |
|------|--------|
| Bullseye (Gold) | 10 |
| Red ring | 8 |
| Blue ring | 6 |
| Black ring | 4 |
| White ring | 2 |
| Green / Orange ring | 0 |
| Miss (outside target) | 0 |

Each player takes **3 shots**. Maximum possible score is **30**. The player with the higher total wins. Equal scores result in a draw.

---

## Game Modes

### vs AI
Play against a CPU opponent. Three difficulty levels affect how accurately the AI compensates for wind:

| Difficulty | Wind Compensation | Spread |
|------------|-------------------|--------|
| Low | None | Large random error |
| Medium | 60% | Moderate error |
| High | 95% | Very tight grouping |

### 2 Players
Both players take turns on the same device. Player 1 shoots first each round, followed by Player 2. Wind changes between rounds.

---

## Turn Order

Rounds alternate between players: P1 → P2 → P1 → P2 → P1 → P2. New wind is generated at the start of each round.

---

## Tech Stack

- Plain HTML, CSS, and JavaScript — no frameworks or dependencies
- Canvas 2D API for all rendering
- Runs entirely in the browser, no build step required

---

## Running Locally

```bash
# Clone the repo
git clone https://github.com/sphandlovu12/Archery_game.git

# Open in browser
start index.html   # Windows
open index.html    # macOS
```
