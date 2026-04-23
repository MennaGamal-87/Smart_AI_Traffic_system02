// ============================================================
//  AI Traffic Controller
//  Algorithms: Hill Climbing | Genetic Algorithm | CSP | A*
// ============================================================

class AIController {
    constructor(trafficSystem, vehicleMgr) {
        this.traffic = trafficSystem;
        this.vehicles = vehicleMgr;
        this.mode = 'fixed';
        this.timer = 0;

        // GA state
        this._gaPop = null;
        this._gaGen = 0;

        // UI callback – called after each optimisation step
        this.onStep = null; // (mode, info) => void
    }

    // ── Mode control ─────────────────────────────────────────
    setMode(mode) {
        this.mode = mode;
        this.timer = CFG.AI_INTERVAL; // trigger immediately on next frame

        if (mode === 'fixed') {
            // Fixed baseline: constant equal timers, normal yellow, NO demand-responsive switching
            this.traffic.setAdaptive(false);
            this.traffic.setYellow(CFG.YELLOW);
            this._resetFixed();
        } else {
            // All AI modes: demand-responsive early switching ON, instant yellow
            this.traffic.setAdaptive(true);
            this.traffic.setYellow(0);
            if (mode === 'genetic') {
                this._initGA();
            } else {
                this._gaPop = null;
            }
        }
    }

    _resetFixed() {
        for (let r = 0; r < CFG.GRID; r++)
            for (let c = 0; c < CFG.GRID; c++)
                this._setDurs(r, c, CFG.NS_GREEN, CFG.EW_GREEN);
    }

    // ── Main update ──────────────────────────────────────────
    update(dt) {
        if (this.mode === 'fixed') return;
        this.timer += dt;
        if (this.timer < CFG.AI_INTERVAL) return;
        this.timer = 0;

        const queues = this._getQueues();
        switch (this.mode) {
            case 'hillclimbing': this._hillClimb(queues); break;
            case 'genetic':      this._runGA(queues);     break;
            case 'csp':          this._runCSP(queues);    break;
            case 'astar':        this._runAStar(queues);  break;
        }
    }

    // ── Queue sampling ───────────────────────────────────────
    _getQueues() {
        const q = Array.from({ length: CFG.GRID }, () =>
            Array.from({ length: CFG.GRID }, () => ({ ns: 0, ew: 0 }))
        );
        for (const car of this.vehicles.cars) {
            if (car.state !== 'WAITING') continue;
            const { targetRow: r, targetCol: c } = car;
            if (r < 0 || r >= CFG.GRID || c < 0 || c >= CFG.GRID) continue;
            if (DIR_AXIS[car.dir] === 'NS') q[r][c].ns++;
            else q[r][c].ew++;
        }
        return q;
    }

    // ── Timing helpers ───────────────────────────────────────
    _clamp(v) {
        return Math.max(CFG.MIN_GREEN, Math.min(CFG.MAX_GREEN, Math.round(v)));
    }

    _setDurs(r, c, ns, ew) {
        const ctrl = this.traffic.controllers[r][c];
        ctrl.DURS[0] = this._clamp(ns);
        ctrl.DURS[2] = this._clamp(ew);
    }

    // ── HILL CLIMBING ─────────────────────────────────────────────────────────
    //  Steepest-ascent hill climbing applied locally at each intersection.
    //  State  = (ns_green, ew_green) for one intersection.
    //  Objective: minimise estimated total wait = ns_queue × effective_red_NS
    //               + ew_queue × effective_red_EW.
    //  Neighbours: ns ± STEP, ew adjusted so ns+ew = budget.
    // ─────────────────────────────────────────────────────────────────────────
    _hillClimb(queues) {
        const STEP = 3;
        const BUDGET = CFG.MAX_CYCLE;
        let totalImproved = 0;

        for (let r = 0; r < CFG.GRID; r++) {
            for (let c = 0; c < CFG.GRID; c++) {
                const { ns, ew } = queues[r][c];
                const ctrl = this.traffic.controllers[r][c];
                let curNS = ctrl.DURS[0];
                let curEW = ctrl.DURS[2];

                const cost = (nsg, ewg) =>
                    ns * (ewg + CFG.YELLOW * 2) +   // NS cars wait while EW is green
                    ew * (nsg + CFG.YELLOW * 2);     // EW cars wait while NS is green

                let bestCost = cost(curNS, curEW);
                let bestNS = curNS;

                // Generate neighbours: shift budget by ±STEP
                for (const delta of [-STEP, STEP]) {
                    const tryNS = this._clamp(curNS + delta);
                    const tryEW = this._clamp(BUDGET - tryNS);
                    const c2 = cost(tryNS, tryEW);
                    if (c2 < bestCost) { bestCost = c2; bestNS = tryNS; }
                }

                const bestEW = this._clamp(BUDGET - bestNS);
                if (bestNS !== curNS) totalImproved++;
                this._setDurs(r, c, bestNS, bestEW);
            }
        }
        if (this.onStep) this.onStep('hillclimbing', { improved: totalImproved });
    }

    // ── GENETIC ALGORITHM ─────────────────────────────────────────────────────
    //  Chromosome: array[GRID][GRID] of {ns, ew} green times.
    //  Fitness   : 1 / (estimated_city_wait + 1)   — higher = better.
    //  Selection : top-4 elitism + roulette for crossover pool.
    //  Crossover : uniform (per-intersection gene swap).
    //  Mutation  : random reset of a gene with p = 0.12.
    // ─────────────────────────────────────────────────────────────────────────
    _initGA() {
        const POP = 20;
        this._gaPop = Array.from({ length: POP }, () => this._randomChrom());
        this._gaGen = 0;
    }

    _randomChrom() {
        return Array.from({ length: CFG.GRID }, () =>
            Array.from({ length: CFG.GRID }, () => {
                const ns = CFG.MIN_GREEN + Math.floor(Math.random() * (CFG.MAX_CYCLE - CFG.MIN_GREEN * 2));
                return { ns, ew: this._clamp(CFG.MAX_CYCLE - ns) };
            })
        );
    }

    _fitness(chrom, queues) {
        let wait = 0;
        for (let r = 0; r < CFG.GRID; r++)
            for (let c = 0; c < CFG.GRID; c++) {
                const { ns, ew } = queues[r][c];
                const { ns: nsg, ew: ewg } = chrom[r][c];
                // Estimated wait: cars × full opposing-green cycle
                wait += ns * (ewg + CFG.YELLOW * 2) + ew * (nsg + CFG.YELLOW * 2);
            }
        return 1 / (wait + 1);
    }

    _crossover(a, b) {
        return Array.from({ length: CFG.GRID }, (_, r) =>
            Array.from({ length: CFG.GRID }, (_, c) =>
                Math.random() < 0.5 ? { ...a[r][c] } : { ...b[r][c] }
            )
        );
    }

    _mutate(chrom, rate = 0.12) {
        return chrom.map(row => row.map(gene => {
            if (Math.random() >= rate) return gene;
            const ns = CFG.MIN_GREEN + Math.floor(Math.random() * (CFG.MAX_CYCLE - CFG.MIN_GREEN * 2));
            return { ns, ew: this._clamp(CFG.MAX_CYCLE - ns) };
        }));
    }

    _runGA(queues) {
        if (!this._gaPop) this._initGA();
        const GENS = 10;
        const ELITE = 4;
        const POOL = 8;   // top-k for crossover selection

        let pop = this._gaPop;

        for (let g = 0; g < GENS; g++) {
            const scored = pop
                .map(ch => ({ ch, fit: this._fitness(ch, queues) }))
                .sort((a, b) => b.fit - a.fit);

            const next = scored.slice(0, ELITE).map(s => s.ch);           // elitism

            while (next.length < pop.length) {
                const ai = Math.floor(Math.random() * POOL);
                const bi = Math.floor(Math.random() * POOL);
                next.push(this._mutate(this._crossover(scored[ai].ch, scored[bi].ch)));
            }
            pop = next;
            this._gaGen++;
        }

        this._gaPop = pop;
        const best = pop[0];
        for (let r = 0; r < CFG.GRID; r++)
            for (let c = 0; c < CFG.GRID; c++)
                this._setDurs(r, c, best[r][c].ns, best[r][c].ew);

        if (this.onStep) this.onStep('genetic', { gen: this._gaGen, fitness: this._fitness(best, queues).toFixed(5) });
    }

    // ── CSP ───────────────────────────────────────────────────────────────────
    //  Variables  : nsGreen[r][c],  ewGreen[r][c]   ∀ intersections
    //  Domains    : [MIN_GREEN … MAX_GREEN]
    //  Constraints:
    //    C1: nsGreen + ewGreen ≤ MAX_CYCLE          (hard – cycle length)
    //    C2: nsGreen ≥ MIN_GREEN, ewGreen ≥ MIN_GREEN (hard – fairness)
    //    C3: nsGreen / ewGreen ≈ queue_NS / queue_EW   (soft – preference)
    //    C4 (arc-consistency): adjacent intersections share the same road;
    //       if one gets heavy NS green, neighbours on the same NS road should
    //       also favour NS (green-wave coordination).
    //  Solve: assign each variable proportionally (satisfying C3), then
    //         propagate C4 as a smoothing pass.
    // ─────────────────────────────────────────────────────────────────────────
    _runCSP(queues) {
        // Phase 1 – assign proportionally (satisfies C1–C3)
        const sol = Array.from({ length: CFG.GRID }, (_, r) =>
            Array.from({ length: CFG.GRID }, (_, c) => {
                const { ns, ew } = queues[r][c];
                const total = ns + ew;
                if (total === 0) return { ns: CFG.NS_GREEN, ew: CFG.EW_GREEN };
                const budget = CFG.MAX_CYCLE;
                let nsG = Math.round((ns / total) * (budget - 2 * CFG.MIN_GREEN)) + CFG.MIN_GREEN;
                let ewG = budget - nsG;
                // Fix violations of C2
                if (ewG < CFG.MIN_GREEN) { ewG = CFG.MIN_GREEN; nsG = budget - ewG; }
                if (nsG < CFG.MIN_GREEN) { nsG = CFG.MIN_GREEN; ewG = budget - nsG; }
                return { ns: this._clamp(nsG), ew: this._clamp(ewG) };
            })
        );

        // Phase 2 – arc-consistency propagation (C4)
        // For each pair of adjacent intersections on the same NS road:
        //   if both have ns queue > ew queue, average their ns timings to create green wave
        for (let r = 0; r < CFG.GRID - 1; r++) {
            for (let c = 0; c < CFG.GRID; c++) {
                const a = sol[r][c], b = sol[r + 1][c];
                const qa = queues[r][c], qb = queues[r + 1][c];
                if (qa.ns > qa.ew && qb.ns > qb.ew) {
                    const avg = Math.round((a.ns + b.ns) / 2);
                    sol[r][c].ns = this._clamp(avg);
                    sol[r][c].ew = this._clamp(CFG.MAX_CYCLE - avg);
                    sol[r + 1][c].ns = this._clamp(avg);
                    sol[r + 1][c].ew = this._clamp(CFG.MAX_CYCLE - avg);
                }
            }
        }
        // Same for EW road pairs
        for (let r = 0; r < CFG.GRID; r++) {
            for (let c = 0; c < CFG.GRID - 1; c++) {
                const a = sol[r][c], b = sol[r][c + 1];
                const qa = queues[r][c], qb = queues[r][c + 1];
                if (qa.ew > qa.ns && qb.ew > qb.ns) {
                    const avg = Math.round((a.ew + b.ew) / 2);
                    sol[r][c].ew = this._clamp(avg);
                    sol[r][c].ns = this._clamp(CFG.MAX_CYCLE - avg);
                    sol[r][c + 1].ew = this._clamp(avg);
                    sol[r][c + 1].ns = this._clamp(CFG.MAX_CYCLE - avg);
                }
            }
        }

        // Apply solution
        for (let r = 0; r < CFG.GRID; r++)
            for (let c = 0; c < CFG.GRID; c++)
                this._setDurs(r, c, sol[r][c].ns, sol[r][c].ew);

        if (this.onStep) this.onStep('csp', { vars: CFG.GRID * CFG.GRID * 2 });
    }

    // ── A* SEARCH ─────────────────────────────────────────────────────────────
    //  Applied independently per intersection.
    //  State   : ns_green  (integer in [MIN_GREEN … MAX_CYCLE - MIN_GREEN])
    //  g(n)    : distance from start state (steps taken × STEP size)
    //  h(n)    : Manhattan distance to queue-proportional optimal (admissible).
    //  f(n)    : g(n) + h(n)  — node priority in the open set.
    //  Outcome : ns_green that minimises estimated intersection wait,
    //            found by A* traversal rather than greedy local search.
    // ─────────────────────────────────────────────────────────────────────────
    _runAStar(queues) {
        const STEP           = 2;   // step size when generating neighbours
        const MAX_EXPANSIONS = 30;  // max nodes expanded per intersection
        let totalExpanded    = 0;

        for (let r = 0; r < CFG.GRID; r++) {
            for (let c = 0; c < CFG.GRID; c++) {
                const { ns: nsQ, ew: ewQ } = queues[r][c];
                const ctrl    = this.traffic.controllers[r][c];
                const startNS = ctrl.DURS[0];

                // Actual cost at a given ns_green
                const cost = (nsG) => {
                    const ewG = this._clamp(CFG.MAX_CYCLE - nsG);
                    return nsQ * (ewG + CFG.YELLOW * 2)
                         + ewQ * (nsG + CFG.YELLOW * 2);
                };

                // Admissible heuristic: Manhattan distance to proportionally-optimal ns_green
                const total = nsQ + ewQ;
                const nsOpt = total === 0
                    ? CFG.NS_GREEN
                    : this._clamp(
                        Math.round((nsQ / total) * (CFG.MAX_CYCLE - 2 * CFG.MIN_GREEN))
                        + CFG.MIN_GREEN
                      );
                const h = (ns) => Math.abs(ns - nsOpt);

                // A* open set: ns_green → { g, f }
                const open   = new Map();
                const closed = new Set();
                open.set(startNS, { g: 0, f: h(startNS) });

                let bestNS   = startNS;
                let bestCost = cost(startNS);
                let expansions = 0;

                while (open.size > 0 && expansions < MAX_EXPANSIONS) {
                    // Pop node with lowest f
                    let currNS = null, currF = Infinity;
                    for (const [ns, node] of open) {
                        if (node.f < currF) { currF = node.f; currNS = ns; }
                    }
                    const currG = open.get(currNS).g;
                    open.delete(currNS);
                    closed.add(currNS);
                    expansions++;
                    totalExpanded++;

                    // Track best actual-cost state found so far
                    const c2 = cost(currNS);
                    if (c2 < bestCost) { bestCost = c2; bestNS = currNS; }

                    // Generate neighbours (±STEP)
                    for (const delta of [-STEP, STEP]) {
                        const nb = this._clamp(currNS + delta);
                        if (closed.has(nb)) continue;
                        const newG = currG + STEP;
                        const newF = newG + h(nb);
                        if (!open.has(nb) || newG < open.get(nb).g) {
                            open.set(nb, { g: newG, f: newF });
                        }
                    }
                }

                this._setDurs(r, c, bestNS, this._clamp(CFG.MAX_CYCLE - bestNS));
            }
        }

        if (this.onStep) this.onStep('astar', { expanded: totalExpanded });
    }

    // ── Public helpers ───────────────────────────────────────

    /** Average NS and EW green times across all intersections */
    avgTimings() {
        let ns = 0, ew = 0;
        for (let r = 0; r < CFG.GRID; r++)
            for (let c = 0; c < CFG.GRID; c++) {
                ns += this.traffic.controllers[r][c].DURS[0];
                ew += this.traffic.controllers[r][c].DURS[2];
            }
        const n = CFG.GRID * CFG.GRID;
        return { ns: (ns / n).toFixed(1), ew: (ew / n).toFixed(1) };
    }
}
