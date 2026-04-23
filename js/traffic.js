// ============================================================
//  Traffic Light System
// ============================================================

/** One 3-light signal head mounted on a pole */
class TrafficLight {
    constructor(scene, position, axis) {
        this.axis = axis; // 'NS' or 'EW'
        this.group = new THREE.Group();

        // Pole
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.22, 8, 8),
            new THREE.MeshLambertMaterial({ color: 0x222233 })
        );
        pole.position.y = 4;
        pole.castShadow = true;
        this.group.add(pole);

        // Housing
        const housing = new THREE.Mesh(
            new THREE.BoxGeometry(1.3, 4.2, 1.0),
            new THREE.MeshLambertMaterial({ color: 0x111122 })
        );
        housing.position.y = 9.5;
        this.group.add(housing);

        // Arm extending over road
        const arm = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.3, 2.5),
            new THREE.MeshLambertMaterial({ color: 0x222233 })
        );
        arm.position.set(0, 8, 1.3);
        this.group.add(arm);

        // The 3 light bulbs
        this._lights = {
            red: this._addBulb(0xff2200, 0),
            yellow: this._addBulb(0xffaa00, 1),
            green: this._addBulb(0x00dd55, 2),
        };

        this.group.position.copy(position);
        scene.add(this.group);

        this.setState('red');
    }

    _addBulb(color, slot) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, roughness: 0.5 });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 10), mat);
        // slot 0=red(top), 1=yellow(mid), 2=green(bot)
        mesh.position.set(0, 11.0 - slot * 1.5, 0.55);
        this.group.add(mesh);
        return { mesh, mat, onColor: color };
    }

    /** state: 'red' | 'yellow' | 'green' */
    setState(state) {
        this._currentState = state;
        const OFF = 0x111111;
        for (const [key, bulb] of Object.entries(this._lights)) {
            const on = (key === state);
            bulb.mat.color.setHex(on ? bulb.onColor : OFF);
            bulb.mat.emissive.setHex(on ? bulb.onColor : 0x000000);
            bulb.mat.emissiveIntensity = on ? 1 : 0;
        }
    }

    getState() { return this._currentState; }

    /** Update emissive intensity for night mode */
    setNight(isNight) {
        for (const bulb of Object.values(this._lights)) {
            if (bulb.mat.emissiveIntensity > 0) {
                bulb.mat.emissiveIntensity = isNight ? 2.5 : 1.0;
            }
        }
    }
}

// Minimum seconds a green phase must run before an early-switch is allowed.
// Prevents rapid flickering. Only active when adaptive === true (AI modes).
const MIN_EARLY_SWITCH = 4;

// ─────────────────────────────────────────────────────────────

/** Controls one intersection (4 traffic lights, phase cycling) */
class IntersectionController {
    constructor(scene, row, col) {
        this.row = row;
        this.col = col;

        // Phase: 0=NS_GREEN 1=NS_YELLOW 2=EW_GREEN 3=EW_YELLOW
        this.phase = Math.floor(Math.random() * 4);
        this.DURS = [CFG.NS_GREEN, CFG.YELLOW, CFG.EW_GREEN, CFG.YELLOW];
        this.timer = Math.random() * this.DURS[this.phase];

        // Demand-responsive fields (used only when adaptive === true)
        this.adaptive  = false;  // enabled by AI modes, disabled for Fixed
        this.queueNS   = 0;      // waiting cars on NS axis (updated each frame)
        this.queueEW   = 0;      // waiting cars on EW axis
        this._greenAge = 0;      // seconds the current green phase has been alive

        const ix = CFG.ixX(col);
        const iz = CFG.ixZ(row);
        const hw = CFG.ROAD_W / 2;

        // Place 4 lights  (one per approach); use a small corner offset
        this.lights = [
            new TrafficLight(scene, new THREE.Vector3(ix - hw - 1.5, 0, iz - hw - 1.5), 'NS'), // NW corner → NS
            new TrafficLight(scene, new THREE.Vector3(ix + hw + 1.5, 0, iz - hw - 1.5), 'EW'), // NE corner → EW
            new TrafficLight(scene, new THREE.Vector3(ix + hw + 1.5, 0, iz + hw + 1.5), 'NS'), // SE corner → NS
            new TrafficLight(scene, new THREE.Vector3(ix - hw - 1.5, 0, iz + hw + 1.5), 'EW'), // SW corner → EW
        ];

        // Apply initial phase
        this._applyPhase();
    }

    update(dt) {
        // Track how long the current green phase has been alive
        if (this.phase === 0 || this.phase === 2) this._greenAge += dt;

        // ── Demand-responsive early switch (AI modes only) ───────────────
        // If the currently-green road has NO waiting cars and the opposing
        // road DOES, skip remaining green time so waiting cars are served.
        // Gated by this.adaptive so Fixed mode is NEVER affected —
        // Fixed stays purely timer-based for a fair baseline comparison.
        if (this.adaptive && this._greenAge >= MIN_EARLY_SWITCH) {
            const nsGreen = (this.phase === 0);
            const ewGreen = (this.phase === 2);
            if (nsGreen && this.queueNS === 0 && this.queueEW > 0) this.timer = 0;
            else if (ewGreen && this.queueEW === 0 && this.queueNS > 0) this.timer = 0;
        }

        this.timer -= dt;
        if (this.timer <= 0) {
            this.phase = (this.phase + 1) % 4;
            this.timer = this.DURS[this.phase];
            if (this.phase === 0 || this.phase === 2) this._greenAge = 0;
            this._applyPhase();
        }
    }

    _applyPhase() {
        const nsState = [
            'green', 'yellow', 'red', 'red',
        ][this.phase];
        const ewState = [
            'red', 'red', 'green', 'yellow',
        ][this.phase];

        for (const light of this.lights) {
            light.setState(light.axis === 'NS' ? nsState : ewState);
        }
    }

    /** Returns 'red'|'yellow'|'green' for a car moving in given direction */
    getStateForDir(dir) {
        const axis = DIR_AXIS[dir]; // 'NS' or 'EW'
        if (axis === 'NS') return ['green', 'yellow', 'red', 'red'][this.phase];
        else return ['red', 'red', 'green', 'yellow'][this.phase];
    }

    setNight(n) { this.lights.forEach(l => l.setNight(n)); }
}

// ─────────────────────────────────────────────────────────────

/** Manages all intersection controllers */
class TrafficSystem {
    constructor(scene) {
        this.controllers = [];
        for (let r = 0; r < CFG.GRID; r++) {
            this.controllers[r] = [];
            for (let c = 0; c < CFG.GRID; c++) {
                this.controllers[r][c] = new IntersectionController(scene, r, c);
            }
        }
    }

    update(dt) {
        for (let r = 0; r < CFG.GRID; r++)
            for (let c = 0; c < CFG.GRID; c++)
                this.controllers[r][c].update(dt);
    }

    /** Get signal state for a car approaching intersection (tr, tc) from direction dir */
    getState(tr, tc, dir) {
        if (tr < 0 || tr >= CFG.GRID || tc < 0 || tc >= CFG.GRID) return 'green';
        return this.controllers[tr][tc].getStateForDir(dir);
    }

    /**
     * Count waiting cars per intersection per axis and push numbers into
     * each controller so demand-responsive logic can fire (AI modes only).
     */
    updateQueues(cars) {
        for (let r = 0; r < CFG.GRID; r++)
            for (let c = 0; c < CFG.GRID; c++) {
                this.controllers[r][c].queueNS = 0;
                this.controllers[r][c].queueEW = 0;
            }
        for (const car of cars) {
            if (car.state !== 'WAITING') continue;
            const { targetRow: r, targetCol: c } = car;
            if (r < 0 || r >= CFG.GRID || c < 0 || c >= CFG.GRID) continue;
            const ctrl = this.controllers[r][c];
            if (DIR_AXIS[car.dir] === 'NS') ctrl.queueNS++;
            else ctrl.queueEW++;
        }
    }

    /** Enable/disable demand-responsive switching on all intersections.
     *  true  → AI mode (can skip idle green phases).
     *  false → Fixed mode (pure timed cycling, never skips). */
    setAdaptive(v) {
        for (let r = 0; r < CFG.GRID; r++)
            for (let c = 0; c < CFG.GRID; c++) {
                const ctrl = this.controllers[r][c];
                ctrl.adaptive = v;
                if (!v) ctrl._greenAge = 0;
            }
    }

    /** Set yellow-phase duration on every intersection.
     *  Pass 0 for AI modes (instant switch) or CFG.YELLOW for Fixed. */
    setYellow(v) {
        for (let r = 0; r < CFG.GRID; r++)
            for (let c = 0; c < CFG.GRID; c++) {
                this.controllers[r][c].DURS[1] = v;
                this.controllers[r][c].DURS[3] = v;
            }
    }

    setNight(n) {
        for (let r = 0; r < CFG.GRID; r++)
            for (let c = 0; c < CFG.GRID; c++)
                this.controllers[r][c].setNight(n);
    }
}
