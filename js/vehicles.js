// ============================================================
//  Vehicle System  –  Car model + VehicleManager
// ============================================================

const CAR_COLORS = [
    0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
    0x1abc9c, 0xe67e22, 0xec407a, 0x26c6da, 0xd4e157,
    0xff5722, 0x42a5f5, 0x66bb6a, 0xffa726, 0xab47bc,
];

class Car {
    constructor(scene, trafficSystem, statsTracker) {
        this.scene = scene;
        this.traffic = trafficSystem;
        this.stats = statsTracker || null;   // ← wait-time logger
        this.speed = CFG.CAR_SPEED * (0.8 + Math.random() * 0.4);
        this.state = 'MOVING'; // 'MOVING' | 'WAITING'
        this.active = true;

        // Wait-time tracking
        this.waitAccum = 0;     // seconds accumulated at current red stop
        this.wasWaiting = false; // previous-frame WAITING flag

        this.group = this._buildModel();
        scene.add(this.group);

        // Pick random starting intersection and direction
        this.row = Math.floor(Math.random() * CFG.GRID);
        this.col = Math.floor(Math.random() * CFG.GRID);
        this.dir = Math.floor(Math.random() * 4);

        // Ensure valid direction from edge intersections
        this._clampStartDir();
        this._applyLanePos();
        this._pickTarget();
    }

    // ── 3D Model ──────────────────────────────────────────────
    _buildModel() {
        const g = new THREE.Group();
        const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
        const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.7 });
        const darkMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 0.5 });
        const tlMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 0.5 });

        // Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.0, 2.0), bodyMat);
        body.position.y = 0.5;
        body.castShadow = true;
        g.add(body);

        // Cabin
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.8), bodyMat);
        cabin.position.set(-0.3, 1.45, 0);
        cabin.castShadow = true;
        g.add(cabin);

        // Windshield (front glass)
        const wf = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 1.6), glassMat);
        wf.position.set(0.68, 1.4, 0);
        g.add(wf);

        // Rear window
        const wr = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 1.6), glassMat);
        wr.position.set(-1.28, 1.4, 0);
        g.add(wr);

        // Wheels (4)
        const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.25, 12);
        [[1.2, -0.25, 0.95], [1.2, -0.25, -0.95], [-1.2, -0.25, 0.95], [-1.2, -0.25, -0.95]]
            .forEach(([x, y, z]) => {
                const w = new THREE.Mesh(wheelGeo, darkMat);
                w.rotation.z = Math.PI / 2;
                w.position.set(x, y, z);
                w.castShadow = true;
                g.add(w);
            });

        // Headlights
        [[1.91, 0.5, 0.65], [1.91, 0.5, -0.65]].forEach(([x, y, z]) => {
            const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.35), hlMat);
            hl.position.set(x, y, z); g.add(hl);
        });
        // Taillights
        [[-1.91, 0.5, 0.65], [-1.91, 0.5, -0.65]].forEach(([x, y, z]) => {
            const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.35), tlMat);
            tl.position.set(x, y, z); g.add(tl);
        });

        this._hlMat = hlMat;
        this._tlMat = tlMat;
        return g;
    }

    // ── Positioning helpers ───────────────────────────────────

    /** Snap position onto the correct lane for current row/col/dir */
    _applyLanePos() {
        const ix = CFG.ixX(this.col);
        const iz = CFG.ixZ(this.row);
        switch (this.dir) {
            case DIR.EAST: this.x = ix + CFG.EXIT_OFF; this.z = iz + CFG.LANE_OFF; break;
            case DIR.WEST: this.x = ix - CFG.EXIT_OFF; this.z = iz - CFG.LANE_OFF; break;
            case DIR.SOUTH: this.x = ix + CFG.LANE_OFF; this.z = iz + CFG.EXIT_OFF; break;
            case DIR.NORTH: this.x = ix - CFG.LANE_OFF; this.z = iz - CFG.EXIT_OFF; break;
        }
        this.group.position.set(this.x, 0.35, this.z);
        this.group.rotation.y = DIR_YAW[this.dir];
    }

    _clampStartDir() {
        // Avoid pointing off the grid
        const dirs = [DIR.EAST, DIR.WEST, DIR.NORTH, DIR.SOUTH];
        for (let tries = 0; tries < 8; tries++) {
            const dv = DIR_VEC[this.dir];
            const nr = this.row + dv.dz;
            const nc = this.col + dv.dx;
            if (nr >= 0 && nr < CFG.GRID && nc >= 0 && nc < CFG.GRID) return;
            this.dir = dirs[Math.floor(Math.random() * 4)];
        }
    }

    /** Choose the next target intersection */
    _pickTarget() {
        // Prefer straight, allow left/right turns, no U-turn
        const candidates = [];
        const options = [0, 1, 3]; // straight, right-turn, left-turn (relative)
        for (const rel of options) {
            const d = (this.dir + rel) % 4;
            const dv = DIR_VEC[d];
            const nr = this.row + dv.dz;
            const nc = this.col + dv.dx;
            if (nr >= 0 && nr < CFG.GRID && nc >= 0 && nc < CFG.GRID) {
                const weight = rel === 0 ? 3 : 1; // prefer straight
                for (let w = 0; w < weight; w++) candidates.push({ row: nr, col: nc, dir: d });
            }
        }
        if (candidates.length === 0) {
            // Must U-turn (edge case)
            this.dir = (this.dir + 2) % 4;
            const dv = DIR_VEC[this.dir];
            this.targetRow = this.row + dv.dz;
            this.targetCol = this.col + dv.dx;
        } else {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            this.targetRow = pick.row;
            this.targetCol = pick.col;
            this.dir = pick.dir;
        }
        this.group.rotation.y = DIR_YAW[this.dir];

        // Compute stop line and exit positions for this segment
        const tix = CFG.ixX(this.targetCol);
        const tiz = CFG.ixZ(this.targetRow);
        switch (this.dir) {
            case DIR.EAST:
                this.stopX = tix - CFG.STOP_OFF; this.exitX = tix + CFG.EXIT_OFF;
                this.z = CFG.ixZ(this.row) + CFG.LANE_OFF;
                break;
            case DIR.WEST:
                this.stopX = tix + CFG.STOP_OFF; this.exitX = tix - CFG.EXIT_OFF;
                this.z = CFG.ixZ(this.row) - CFG.LANE_OFF;
                break;
            case DIR.SOUTH:
                this.stopZ = tiz - CFG.STOP_OFF; this.exitZ = tiz + CFG.EXIT_OFF;
                this.x = CFG.ixX(this.col) + CFG.LANE_OFF;
                break;
            case DIR.NORTH:
                this.stopZ = tiz + CFG.STOP_OFF; this.exitZ = tiz - CFG.EXIT_OFF;
                this.x = CFG.ixX(this.col) - CFG.LANE_OFF;
                break;
        }
    }

    // ── Update ────────────────────────────────────────────────
    update(dt, cars) {
        const sig = this.traffic.getState(this.targetRow, this.targetCol, this.dir);
        const isH = (this.dir === DIR.EAST || this.dir === DIR.WEST);
        const prevState = this.state;

        // Check if car in front is too close (follow distance)
        const followDist = this._distToNearest(cars);
        const effectiveSpeed = followDist < 9 ? 0 : (followDist < 16 ? this.speed * 0.4 : this.speed);

        if (isH) {
            const atStop = this.dir === DIR.EAST
                ? (this.x >= this.stopX - 0.5 && this.x < this.exitX)
                : (this.x <= this.stopX + 0.5 && this.x > this.exitX);

            if (atStop && (sig === 'red' || sig === 'yellow')) {
                this.state = 'WAITING';
                this.x = this.dir === DIR.EAST
                    ? Math.min(this.x, this.stopX)
                    : Math.max(this.x, this.stopX);
            } else {
                this.state = 'MOVING';
                this.x += DIR_VEC[this.dir].dx * effectiveSpeed * dt;
            }

            const past = this.dir === DIR.EAST ? (this.x >= this.exitX) : (this.x <= this.exitX);
            if (past) this._arrive();

        } else {
            const atStop = this.dir === DIR.SOUTH
                ? (this.z >= this.stopZ - 0.5 && this.z < this.exitZ)
                : (this.z <= this.stopZ + 0.5 && this.z > this.exitZ);

            if (atStop && (sig === 'red' || sig === 'yellow')) {
                this.state = 'WAITING';
                this.z = this.dir === DIR.SOUTH
                    ? Math.min(this.z, this.stopZ)
                    : Math.max(this.z, this.stopZ);
            } else {
                this.state = 'MOVING';
                this.z += DIR_VEC[this.dir].dz * effectiveSpeed * dt;
            }
            const past = this.dir === DIR.SOUTH ? (this.z >= this.exitZ) : (this.z <= this.exitZ);
            if (past) this._arrive();
        }

        // ── Wait-time tracking ──────────────────────────────
        if (this.state === 'WAITING') {
            this.waitAccum += dt;
            this.wasWaiting = true;
        } else if (this.wasWaiting) {
            // Just released from red — log accumulated wait
            if (this.stats && this.waitAccum > 0)
                this.stats.logWait(this.waitAccum);
            this.waitAccum = 0;
            this.wasWaiting = false;
        }

        this.group.position.set(this.x, 0.35, this.z);
    }

    /** Distance to nearest car directly ahead */
    _distToNearest(cars) {
        let minD = Infinity;
        for (const other of cars) {
            if (other === this || other.dir !== this.dir) continue;
            let d = Infinity;
            switch (this.dir) {
                case DIR.EAST: if (other.x > this.x && Math.abs(other.z - this.z) < 2) d = other.x - this.x; break;
                case DIR.WEST: if (other.x < this.x && Math.abs(other.z - this.z) < 2) d = this.x - other.x; break;
                case DIR.SOUTH: if (other.z > this.z && Math.abs(other.x - this.x) < 2) d = other.z - this.z; break;
                case DIR.NORTH: if (other.z < this.z && Math.abs(other.x - this.x) < 2) d = this.z - other.z; break;
            }
            if (d < minD) minD = d;
        }
        return minD;
    }

    _arrive() {
        this.row = this.targetRow;
        this.col = this.targetCol;
        this._pickTarget();
    }

    remove() {
        this.scene.remove(this.group);
        this.active = false;
    }

    setNight(isNight) {
        this._hlMat.emissiveIntensity = isNight ? 3 : 0.5;
        this._tlMat.emissiveIntensity = isNight ? 3 : 0.5;
    }
}

// ─────────────────────────────────────────────────────────────

class VehicleManager {
    constructor(scene, trafficSystem, statsTracker) {
        this.scene = scene;
        this.traffic = trafficSystem;
        this.stats = statsTracker || null;
        this.cars = [];
        this.isNight = false;
    }

    spawnCars(count) {
        for (let i = 0; i < count; i++) {
            if (this.cars.length >= 180) break;
            const car = new Car(this.scene, this.traffic, this.stats);
            car.setNight(this.isNight);
            this.cars.push(car);
        }
    }

    update(dt) {
        for (const car of this.cars) car.update(dt, this.cars);
    }

    getCount() { return this.cars.length; }

    countWaiting() { return this.cars.filter(c => c.state === 'WAITING').length; }

    setNight(n) {
        this.isNight = n;
        this.cars.forEach(c => c.setNight(n));
    }

    reset() {
        this.cars.forEach(c => c.remove());
        this.cars = [];
    }
}
