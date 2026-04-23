// ============================================================
//  City Builder  –  ground, roads, road-markings, buildings
// ============================================================
class CityBuilder {
    constructor(scene) {
        this.scene = scene;
        this.matRoad = new THREE.MeshLambertMaterial({ color: 0x252528 });
        this.matMarkW = new THREE.MeshLambertMaterial({ color: 0xffffff });
        this.matMarkY = new THREE.MeshLambertMaterial({ color: 0xffcc00 });
        this.matGrass = new THREE.MeshLambertMaterial({ color: 0x3a6e35 });
        this.matSidewalk = new THREE.MeshLambertMaterial({ color: 0x888899 });

        this.buildPalette = [
            0x4a6fa5, 0x5a7ebc, 0x3d5a80, 0x6a8cbf,
            0x5c7a5c, 0x7a9e6b, 0x4d7a4d,
            0x7a5e47, 0xa0836a, 0x8b6f47,
            0x7a5ea6, 0x9b7ac4, 0x5e4a8b,
            0x5a7a7a, 0x7a9e9e, 0x4d7a8b,
            0xc4956a, 0xd4a57a, 0xb8804a,
            0x2e4e6e, 0x1a3a5c, 0x485e8c,
        ];
    }

    build() {
        this._createGround();
        this._createRoads();
        this._createRoadMarkings();
        this._createBuildings();
    }

    // ── Ground ──────────────────────────────────────────────
    _createGround() {
        const size = CFG.HALF * 2 + 80;
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(size, size),
            this.matGrass
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = -0.02;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
    }

    // ── Road surface ─────────────────────────────────────────
    _createRoads() {
        const len = CFG.HALF * 2 + CFG.ROAD_W;
        const h = 0.05;

        for (let r = 0; r < CFG.GRID; r++) {
            const m = new THREE.Mesh(
                new THREE.BoxGeometry(len, h, CFG.ROAD_W),
                this.matRoad
            );
            m.position.set(0, h / 2, CFG.ixZ(r));
            m.receiveShadow = true;
            this.scene.add(m);
        }
        for (let c = 0; c < CFG.GRID; c++) {
            const m = new THREE.Mesh(
                new THREE.BoxGeometry(CFG.ROAD_W, h, len),
                this.matRoad
            );
            m.position.set(CFG.ixX(c), h / 2, 0);
            m.receiveShadow = true;
            this.scene.add(m);
        }

        // Sidewalks alongside each road segment between intersections
        const swW = 2.5, swH = 0.12;
        for (let r = 0; r < CFG.GRID - 1; r++) {
            for (let c = 0; c < CFG.GRID - 1; c++) {
                const segLen = CFG.SPACING - CFG.ROAD_W;
                const midX = (CFG.ixX(c) + CFG.ixX(c + 1)) / 2;
                const midZ = (CFG.ixZ(r) + CFG.ixZ(r + 1)) / 2;
                // Horizontal sidewalks (N and S of horizontal road)
                [-1, 1].forEach(side => {
                    const sw = new THREE.Mesh(
                        new THREE.BoxGeometry(segLen, swH, swW),
                        this.matSidewalk
                    );
                    sw.position.set(midX, swH / 2, CFG.ixZ(r) + side * (CFG.ROAD_W / 2 + swW / 2));
                    this.scene.add(sw);
                });
                // Vertical sidewalks (E and W of vertical road)
                [-1, 1].forEach(side => {
                    const sw = new THREE.Mesh(
                        new THREE.BoxGeometry(swW, swH, segLen),
                        this.matSidewalk
                    );
                    sw.position.set(CFG.ixX(c) + side * (CFG.ROAD_W / 2 + swW / 2), swH / 2, midZ);
                    this.scene.add(sw);
                });
            }
        }
    }

    // ── Road markings (dashes + stop lines) ─────────────────
    _createRoadMarkings() {
        const dH = 0.07;
        const dL = 5;    // dash length
        const gap = 7;    // gap between dashes
        const dW = 0.3;

        // Helper
        const addMesh = (geo, mat, x, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, dH, z);
            this.scene.add(m);
        };

        // Centre dashes – horizontal roads
        for (let r = 0; r < CFG.GRID; r++) {
            const iz = CFG.ixZ(r);
            for (let c = 0; c < CFG.GRID - 1; c++) {
                const x0 = CFG.ixX(c) + CFG.ROAD_W / 2 + 3;
                const x1 = CFG.ixX(c + 1) - CFG.ROAD_W / 2 - 3;
                let x = x0 + dL / 2;
                while (x + dL / 2 < x1) {
                    addMesh(new THREE.BoxGeometry(dL, dH, dW), this.matMarkW, x, iz);
                    x += dL + gap;
                }
            }
        }

        // Centre dashes – vertical roads
        for (let c = 0; c < CFG.GRID; c++) {
            const ix = CFG.ixX(c);
            for (let r = 0; r < CFG.GRID - 1; r++) {
                const z0 = CFG.ixZ(r) + CFG.ROAD_W / 2 + 3;
                const z1 = CFG.ixZ(r + 1) - CFG.ROAD_W / 2 - 3;
                let z = z0 + dL / 2;
                while (z + dL / 2 < z1) {
                    addMesh(new THREE.BoxGeometry(dW, dH, dL), this.matMarkY, ix, z);
                    z += dL + gap;
                }
            }
        }

        // Stop lines
        for (let r = 0; r < CFG.GRID; r++) {
            for (let c = 0; c < CFG.GRID; c++) {
                const ix = CFG.ixX(c);
                const iz = CFG.ixZ(r);
                const hw = CFG.ROAD_W / 2;
                // North stop line (southbound cars approach from north)
                if (r > 0) addMesh(new THREE.BoxGeometry(CFG.ROAD_W - 3, dH, 0.6), this.matMarkW, ix, iz - hw - 0.5);
                // South stop line
                if (r < CFG.GRID - 1) addMesh(new THREE.BoxGeometry(CFG.ROAD_W - 3, dH, 0.6), this.matMarkW, ix, iz + hw + 0.5);
                // West stop line (eastbound cars)
                if (c > 0) addMesh(new THREE.BoxGeometry(0.6, dH, CFG.ROAD_W - 3), this.matMarkW, ix - hw - 0.5, iz);
                // East stop line
                if (c < CFG.GRID - 1) addMesh(new THREE.BoxGeometry(0.6, dH, CFG.ROAD_W - 3), this.matMarkW, ix + hw + 0.5, iz);

                // Crosswalk stripes at each intersection corner
                this._crosswalk(ix, iz);
            }
        }
    }

    _crosswalk(ix, iz) {
        const mat = this.matMarkW;
        const stripeW = 1.2, stripeH = 0.08;
        const hw = CFG.ROAD_W / 2;
        const count = 4;
        const space = (CFG.ROAD_W - 3) / count;

        for (let i = 0; i < count; i++) {
            const off = -((count - 1) / 2) * space + i * space;
            // N crosswalk
            const nz = iz - hw + 1.5;
            if (nz > -CFG.HALF - 5) {
                const m1 = new THREE.Mesh(new THREE.BoxGeometry(stripeW, stripeH, 3), mat);
                m1.position.set(ix + off, stripeH, nz); this.scene.add(m1);
            }
            // S crosswalk
            const sz = iz + hw - 1.5;
            const m2 = new THREE.Mesh(new THREE.BoxGeometry(stripeW, stripeH, 3), mat);
            m2.position.set(ix + off, stripeH, sz); this.scene.add(m2);
            // W crosswalk
            const m3 = new THREE.Mesh(new THREE.BoxGeometry(3, stripeH, stripeW), mat);
            m3.position.set(ix - hw + 1.5, stripeH, iz + off); this.scene.add(m3);
            // E crosswalk
            const m4 = new THREE.Mesh(new THREE.BoxGeometry(3, stripeH, stripeW), mat);
            m4.position.set(ix + hw - 1.5, stripeH, iz + off); this.scene.add(m4);
        }
    }

    // ── Buildings ────────────────────────────────────────────
    _createBuildings() {
        const setback = 3;
        for (let r = 0; r < CFG.GRID - 1; r++) {
            for (let c = 0; c < CFG.GRID - 1; c++) {
                const x0 = CFG.ixX(c) + CFG.ROAD_W / 2 + setback;
                const x1 = CFG.ixX(c + 1) - CFG.ROAD_W / 2 - setback;
                const z0 = CFG.ixZ(r) + CFG.ROAD_W / 2 + setback;
                const z1 = CFG.ixZ(r + 1) - CFG.ROAD_W / 2 - setback;
                this._fillBlock(x0, z0, x1 - x0, z1 - z0);
            }
        }
    }

    _fillBlock(bx0, bz0, bW, bD) {
        const count = 3 + Math.floor(Math.random() * 4);
        const placed = [];

        for (let i = 0; i < count; i++) {
            for (let attempt = 0; attempt < 30; attempt++) {
                const bw = 7 + Math.random() * 13;
                const bd = 7 + Math.random() * 13;
                const bh = 8 + Math.random() * 42;
                const bx = bx0 + bw / 2 + Math.random() * Math.max(0, bW - bw);
                const bz = bz0 + bd / 2 + Math.random() * Math.max(0, bD - bd);

                let ok = true;
                for (const p of placed) {
                    if (Math.abs(bx - p.x) < (bw + p.w) / 2 + 1 &&
                        Math.abs(bz - p.z) < (bd + p.d) / 2 + 1) {
                        ok = false; break;
                    }
                }
                if (!ok) continue;

                placed.push({ x: bx, z: bz, w: bw, d: bd });

                const color = this.buildPalette[Math.floor(Math.random() * this.buildPalette.length)];
                const roofCol = 0x1a1a2e;

                // Main body
                const body = new THREE.Mesh(
                    new THREE.BoxGeometry(bw, bh, bd),
                    new THREE.MeshLambertMaterial({ color })
                );
                body.position.set(bx, bh / 2, bz);
                body.castShadow = body.receiveShadow = true;
                this.scene.add(body);

                // Roof slab
                const roof = new THREE.Mesh(
                    new THREE.BoxGeometry(bw + 0.4, 0.6, bd + 0.4),
                    new THREE.MeshLambertMaterial({ color: roofCol })
                );
                roof.position.set(bx, bh + 0.3, bz);
                this.scene.add(roof);

                // Windows – simple bright rectangles on each face
                this._addWindows(bx, bz, bw, bh, bd, color);
                break;
            }
        }
    }

    _addWindows(bx, bz, bw, bh, bd, baseColor) {
        const winMat = new THREE.MeshLambertMaterial({ color: 0xffd080, emissive: 0x443300 });
        const wW = 1.0, wH = 1.4, depth = 0.05;
        const colsX = Math.max(1, Math.floor(bw / 3.5));
        const colsZ = Math.max(1, Math.floor(bd / 3.5));
        const rows = Math.max(1, Math.floor(bh / 4));

        const px = bw / (colsX + 1);
        const pz = bd / (colsZ + 1);
        const py = bh / (rows + 1);

        for (let row = 1; row <= rows; row++) {
            const wy = row * py;
            // +X face
            for (let ci = 1; ci <= colsX; ci++) {
                const w = new THREE.Mesh(new THREE.BoxGeometry(depth, wH, wW), winMat);
                w.position.set(bx + bw / 2 + depth / 2, wy, bz - bw / 2 + ci * px);
                this.scene.add(w);
            }
            // −X face
            for (let ci = 1; ci <= colsX; ci++) {
                const w = new THREE.Mesh(new THREE.BoxGeometry(depth, wH, wW), winMat);
                w.position.set(bx - bw / 2 - depth / 2, wy, bz - bw / 2 + ci * px);
                this.scene.add(w);
            }
            // +Z face
            for (let ci = 1; ci <= colsZ; ci++) {
                const w = new THREE.Mesh(new THREE.BoxGeometry(wW, wH, depth), winMat);
                w.position.set(bx - bd / 2 + ci * pz, wy, bz + bd / 2 + depth / 2);
                this.scene.add(w);
            }
            // −Z face
            for (let ci = 1; ci <= colsZ; ci++) {
                const w = new THREE.Mesh(new THREE.BoxGeometry(wW, wH, depth), winMat);
                w.position.set(bx - bd / 2 + ci * pz, wy, bz - bd / 2 - depth / 2);
                this.scene.add(w);
            }
        }
    }
}
