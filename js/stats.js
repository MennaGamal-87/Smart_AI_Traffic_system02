// ============================================================
//  StatsTracker  –  per-mode waiting-time statistics
// ============================================================
class StatsTracker {
    constructor() {
        this.MODES = ['fixed', 'hillclimbing', 'genetic', 'csp', 'astar'];
        this._s = {};
        this.MODES.forEach(m => this._reset(m));
        this.currentMode = 'fixed';
    }

    _reset(mode) {
        this._s[mode] = {
            totalWait: 0,
            count: 0,   // cars that finished waiting
            maxWait: 0,
            elapsed: 0,
            passed: 0,   // total cars that moved through any intersection
        };
    }

    setMode(m) { this.currentMode = m; }

    /** Called when a car finishes its stop at a red light */
    logWait(sec) {
        const s = this._s[this.currentMode];
        s.totalWait += sec;
        s.count++;
        if (sec > s.maxWait) s.maxWait = sec;
        s.passed++;
    }

    /** Advance elapsed time for throughput calculation */
    tick(dt) {
        this._s[this.currentMode].elapsed += dt;
    }

    /** Average wait in seconds for the given mode (default: current) */
    avgWait(mode) {
        const s = this._s[mode || this.currentMode];
        return s.count > 0 ? s.totalWait / s.count : 0;
    }

    /** Cars-per-minute throughput */
    throughput(mode) {
        const s = this._s[mode || this.currentMode];
        return s.elapsed > 10 ? (s.passed / s.elapsed) * 60 : 0;
    }

    maxWait(mode) { return this._s[mode || this.currentMode].maxWait; }

    get(mode) { return this._s[mode || this.currentMode]; }

    /** How many intersections have been recorded at all for this mode */
    hasData(mode) { return this._s[mode].count > 0; }

    resetMode(mode) { this._reset(mode); }
}
