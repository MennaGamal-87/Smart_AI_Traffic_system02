// ============================================================
//  UI Controller  –  HUD + AI Control Panel + Comparison Chart
// ============================================================

const MODE_META = {
    fixed: {
        label: 'Fixed Timer',
        color: '#6699ff',
        short: 'Fixed',
        desc: 'Static green timers (18 s NS / 18 s EW) regardless of congestion. Simple baseline — all intersections run the same cycle.',
    },
    hillclimbing: {
        label: 'Hill Climbing',
        color: '#ff9944',
        short: 'Hill',
        desc: 'Steepest-ascent local search. Each intersection independently shifts its green budget toward the direction with more waiting cars. Fast, greedy, locally optimal.',
    },
    genetic: {
        label: 'Genetic Algorithm',
        color: '#44dd88',
        short: 'GA',
        desc: 'Evolves a population of 20 city-wide timing plans over 10 generations per step. Uses elitism, uniform crossover, and random mutation to minimise city-wide wait.',
    },
    csp: {
        label: 'CSP',
        color: '#ff66aa',
        short: 'CSP',
        desc: 'Models green times as constraint variables. Proportional assignment satisfies fairness & cycle bounds. Arc-consistency propagation creates green-wave coordination between adjacent intersections.',
    },
    astar: {
        label: 'A* Search',
        color: '#ffdd44',
        short: 'A*',
        desc: 'Applies A* search independently at each intersection. State = NS green time. Heuristic = Manhattan distance to queue-proportional optimum (admissible). Finds the globally-best local timing by exploring the state space rather than relying on greedy hill-climbing.',
    },
};

class UIController {
    constructor(vehicleMgr, trafficSys, aiCtrl, statsTracker, getSpeed, setSpeed) {
        this.vehicleMgr = vehicleMgr;
        this.trafficSys = trafficSys;
        this.ai = aiCtrl;
        this.stats = statsTracker;
        this.getSpeed = getSpeed;
        this.setSpeed = setSpeed;
        this.isNight = false;
        this.elapsed = 0;
        this.currentMode = 'fixed';

        // Auto-compare state
        this.autoCompare = false;
        this.autoTimer = 0;
        this.autoDuration = 20; // seconds per mode
        this.autoQueue = ['fixed', 'hillclimbing', 'genetic', 'csp', 'astar'];
        this.autoIdx = 0;

        // Chart canvas
        this._chartCanvas = document.getElementById('chart-canvas');
        this._chartCtx = this._chartCanvas ? this._chartCanvas.getContext('2d') : null;

        this._buildPanel();
        this._bindControls();
        this._switchMode('fixed');
    }

    // ── Build the right panel DOM ─────────────────────────────
    _buildPanel() {
        // Mode buttons
        const btnGroup = document.getElementById('mode-buttons');
        if (!btnGroup) return;
        btnGroup.innerHTML = '';

        for (const [key, meta] of Object.entries(MODE_META)) {
            const btn = document.createElement('button');
            btn.id = `btn-mode-${key}`;
            btn.className = 'mode-btn';
            btn.textContent = meta.short;
            btn.style.setProperty('--mcolor', meta.color);
            btn.addEventListener('click', () => this._switchMode(key));
            btnGroup.appendChild(btn);
        }
    }

    _switchMode(mode) {
        this.currentMode = mode;

        // Update active button styling
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`btn-mode-${mode}`);
        if (btn) btn.classList.add('active');

        // Update description
        const desc = document.getElementById('algo-desc');
        const lblEl = document.getElementById('algo-label');
        const meta = MODE_META[mode];
        if (desc) desc.textContent = meta.desc;
        if (lblEl) { lblEl.textContent = meta.label; lblEl.style.color = meta.color; }

        // Tell stats + AI controller
        this.stats.setMode(mode);
        this.ai.setMode(mode);

        // Reset stats for a fresh comparison each time you switch
        // (optional: comment out to accumulate across switches)
        // this.stats.resetMode(mode);
    }

    // ── Bind existing left-panel controls ────────────────────
    _bindControls() {
        document.getElementById('btn-add-cars')?.addEventListener('click', () => {
            this.vehicleMgr.spawnCars(5);
        });

        document.getElementById('btn-day-night')?.addEventListener('click', () => {
            this.isNight = !this.isNight;
            document.getElementById('btn-day-night').textContent = this.isNight ? '☀️ Day' : '🌙 Night';
            document.dispatchEvent(new CustomEvent('toggleNight', { detail: this.isNight }));
        });

        document.getElementById('btn-reset')?.addEventListener('click', () => {
            this.vehicleMgr.reset();
            this.vehicleMgr.spawnCars(CFG.MAX_CARS);
            this.elapsed = 0;
            this.autoTimer = 0;
            // Reset all mode stats
            ['fixed', 'hillclimbing', 'genetic', 'csp', 'astar'].forEach(m => this.stats.resetMode(m));
        });

        document.getElementById('speed-slider')?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.setSpeed(v);
            document.getElementById('speed-label').textContent = v.toFixed(1) + '×';
        });

        document.getElementById('btn-auto-compare')?.addEventListener('click', () => {
            this.autoCompare = !this.autoCompare;
            this.autoTimer = 0;
            this.autoIdx = 0;
            const el = document.getElementById('btn-auto-compare');
            if (el) el.textContent = this.autoCompare ? '⏹ Stop Auto' : '▶ Auto Compare';
            if (this.autoCompare) this._switchMode(this.autoQueue[0]);
        });
    }

    // ── Per-frame update ──────────────────────────────────────
    update(dt) {
        this.elapsed += dt;
        this.stats.tick(dt);

        // Auto-compare cycling
        if (this.autoCompare) {
            this.autoTimer += dt;
            if (this.autoTimer >= this.autoDuration) {
                this.autoTimer = 0;
                this.autoIdx = (this.autoIdx + 1) % this.autoQueue.length;
                this._switchMode(this.autoQueue[this.autoIdx]);
            }
            // Show countdown
            const rem = Math.ceil(this.autoDuration - this.autoTimer);
            const cd = document.getElementById('auto-countdown');
            if (cd) cd.textContent = `Next: ${rem}s`;
        } else {
            const cd = document.getElementById('auto-countdown');
            if (cd) cd.textContent = '';
        }

        // Left HUD stats
        const mins = String(Math.floor(this.elapsed / 60)).padStart(2, '0');
        const secs = String(Math.floor(this.elapsed % 60)).padStart(2, '0');
        this._setText('stat-cars', this.vehicleMgr.getCount());
        this._setText('stat-waiting', this.vehicleMgr.countWaiting());
        this._setText('stat-time', `${mins}:${secs}`);

        // Right panel live stats (current mode)
        const avg = this.stats.avgWait();
        const max = this.stats.get().maxWait;
        const tput = this.stats.throughput();
        const cnt = this.stats.get().count;
        this._setText('live-avg', avg > 0 ? avg.toFixed(1) + ' s' : '—');
        this._setText('live-max', max > 0 ? max.toFixed(1) + ' s' : '—');
        this._setText('live-tput', tput > 0 ? tput.toFixed(1) + '/min' : '—');
        this._setText('live-count', cnt > 0 ? cnt + ' cars' : '—');

        // AI timing info
        if (this.currentMode !== 'fixed') {
            const t = this.ai.avgTimings();
            this._setText('timing-ns', t.ns + ' s');
            this._setText('timing-ew', t.ew + ' s');
        } else {
            this._setText('timing-ns', CFG.NS_GREEN + ' s');
            this._setText('timing-ew', CFG.EW_GREEN + ' s');
        }

        // Waiting cars live bar per intersection row × col (aggregated)
        this._updateHeatmap();

        // Draw comparison chart every ~0.5 s
        this._drawChart();
    }

    _setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // ── Heatmap: show waiting cars per direction in a tiny grid ─
    _updateHeatmap() {
        const el = document.getElementById('heatmap');
        if (!el) return;
        const waiting = this.vehicleMgr.countWaiting();
        const total = this.vehicleMgr.getCount();
        const pct = total > 0 ? waiting / total : 0;
        el.style.background = `linear-gradient(to right, #ff4444 ${(pct * 100).toFixed(0)}%, #22cc66 0%)`;
        el.title = `${waiting} of ${total} cars waiting (${(pct * 100).toFixed(0)}%)`;
    }

    // ── Comparison bar chart ─────────────────────────────────
    _drawChart() {
        const ctx = this._chartCtx;
        if (!ctx) return;
        const W = this._chartCanvas.width;
        const H = this._chartCanvas.height;
        ctx.clearRect(0, 0, W, H);

        const modes = Object.keys(MODE_META);
        const avgs = modes.map(m => this.stats.avgWait(m));
        const maxVal = Math.max(...avgs, 1);

        const PAD_L = 6, PAD_R = 6, PAD_T = 20, PAD_B = 28;
        const barW = (W - PAD_L - PAD_R) / modes.length;
        const chartH = H - PAD_T - PAD_B;

        // Title
        ctx.fillStyle = 'rgba(160,190,255,0.7)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Avg Wait Time (seconds)', W / 2, 12);

        modes.forEach((mode, i) => {
            const avg = avgs[i];
            const barH = avg > 0 ? (avg / maxVal) * chartH : 2;
            const x = PAD_L + i * barW;
            const y = PAD_T + chartH - barH;
            const meta = MODE_META[mode];
            const isActive = mode === this.currentMode;

            // Bar
            ctx.fillStyle = this.stats.hasData(mode)
                ? meta.color + (isActive ? 'ff' : 'aa')
                : 'rgba(80,80,120,0.5)';
            ctx.beginPath();
            ctx.roundRect(x + 3, y, barW - 6, barH, 3);
            ctx.fill();

            // Active highlight
            if (isActive) {
                ctx.strokeStyle = meta.color;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // Value label
            if (avg > 0) {
                ctx.fillStyle = '#e0e8ff';
                ctx.font = 'bold 9px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(avg.toFixed(1), x + barW / 2, y - 3);
            }

            // Mode label
            ctx.fillStyle = isActive ? meta.color : 'rgba(160,180,255,0.7)';
            ctx.font = isActive ? 'bold 9px Inter' : '8.5px Inter';
            ctx.fillText(meta.short, x + barW / 2, H - 4);
        });
    }
}
