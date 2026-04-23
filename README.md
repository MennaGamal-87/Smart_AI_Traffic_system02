# 🏙️ Smart AI Traffic Control System

A 3D city simulation that compares AI-based traffic signal control algorithms against traditional fixed timers — built entirely with HTML, CSS, and JavaScript.

---

## 🚀 Live Demo

Open `index.html` in any modern browser — no installation required.

---

## 📌 About the Project

This project simulates an intelligent traffic management system in a 3D city environment. It visualizes how different AI algorithms can optimize traffic light timing to reduce vehicle wait times and improve overall traffic flow compared to conventional fixed-timer signals.

---

## 🤖 AI Algorithms Implemented

| Algorithm | Description |
|---|---|
| **Fixed Timer** | Traditional fixed green/red intervals (baseline) |
| **Hill Climbing** | Iteratively adjusts signal timing to improve local performance |
| **Genetic Algorithm** | Evolves optimal timing configurations over generations |
| **CSP (Constraint Satisfaction)** | Models signal scheduling as a constraint problem |
| **Simulated Annealing** | Explores solutions probabilistically to avoid local minima |

---

## 🗂️ Project Structure

```
Smart_AI_Traffic_system02/
│
├── index.html                  # Main entry point
├── style.css                   # Styles and layout
│
├── js/
│   ├── config.js               # Global configuration and constants
│   ├── stats.js                # Statistics tracking and logging
│   ├── city.js                 # 3D city scene construction (Three.js)
│   ├── traffic.js              # Traffic light logic
│   ├── vehicles.js             # Vehicle spawning and movement
│   ├── ai_control.js           # AI algorithm implementations
│   ├── ui.js                   # UI panels, buttons, and chart rendering
│   └── main.js                 # App initialization and game loop
│
├── AI proposal.pdf             # Project proposal document
├── implementation_plan.md      # Implementation plan
└── walkthrough.md              # Walkthrough and developer notes
```

---

## 🛠️ How to Run

### Option 1 — Open Directly in Browser
Double-click `index.html` to open it in your browser. That's it!

### Option 2 — VS Code with Live Server (Recommended)
1. Open the project folder in **VS Code**
2. Install the **Live Server** extension (by Ritwick Dey)
3. Right-click `index.html` → **"Open with Live Server"**
4. The simulation launches automatically in your browser 🎉

> **No Python, Node.js, or npm required.**

---

## 🎮 Controls

| Action | Control |
|---|---|
| Orbit / Rotate | Left-drag |
| Pan | Right-drag |
| Zoom | Scroll wheel |
| Add Cars | Click `+ Cars` button |
| Toggle Day/Night | Click `🌙 Night` button |
| Reset Simulation | Click `⟳ Reset` button |
| Change Speed | Use the speed slider |
| Switch Algorithm | Click algorithm tabs in AI panel |
| Auto Compare All | Click `▶ Auto Compare` |

---

## 📊 Features

- **3D City Visualization** — Real-time rendered city using Three.js (r128)
- **Live Statistics HUD** — Tracks total cars, waiting cars, and elapsed time
- **AI Control Panel** — Displays current algorithm, average/max wait times, throughput
- **Comparison Chart** — Bar chart comparing all algorithms by average wait time
- **Auto Compare Mode** — Automatically cycles through all algorithms for benchmarking
- **Day / Night Mode** — Toggle between lighting themes
- **Adjustable Simulation Speed** — From 0.25× to 3×

---

## 🧰 Tech Stack

- **HTML5** — Structure
- **CSS3** — Styling and layout
- **JavaScript (ES6+)** — Logic and algorithms
- **Three.js r128** — 3D rendering engine
- **OrbitControls** — Camera controls
- **Canvas API** — Comparison chart rendering

---

## 📋 Requirements

| Tool | Details |
|---|---|
| Browser | Chrome, Firefox, Edge, or Safari (modern version) |
| VS Code | Optional — for editing and Live Server |
| Live Server | VS Code extension for hot-reload preview |

---

## 👩‍💻 Author

**Menna Gamal**
GitHub: [@MennaGamal-87](https://github.com/MennaGamal-87)

---

## 📄 License

This project is open source and available for educational purposes.
