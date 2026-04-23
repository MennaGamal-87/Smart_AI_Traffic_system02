// ============================================================
//  Main Scene Bootstrap & Animation Loop
// ============================================================
(function () {
    // ── Renderer ────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // ── Scene ───────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 260, 520);

    // ── Camera ──────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1000);
    camera.position.set(0, 200, 220);
    camera.lookAt(0, 0, 0);

    // ── Orbit Controls ──────────────────────────────────────
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 40;
    controls.maxDistance = 600;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.target.set(0, 0, 0);

    // ── Lighting ────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
    sun.position.set(120, 200, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 800;
    sun.shadow.camera.left = -280;
    sun.shadow.camera.right = 280;
    sun.shadow.camera.top = 280;
    sun.shadow.camera.bottom = -280;
    sun.shadow.bias = -0.001;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.3);
    fill.position.set(-100, 80, -80);
    scene.add(fill);

    // ── Build city ──────────────────────────────────────────
    new CityBuilder(scene).build();

    // ── Core systems ────────────────────────────────────────
    const trafficSystem = new TrafficSystem(scene);
    const statsTracker = new StatsTracker();
    const vehicleMgr = new VehicleManager(scene, trafficSystem, statsTracker);
    const aiCtrl = new AIController(trafficSystem, vehicleMgr);

    vehicleMgr.spawnCars(CFG.MAX_CARS);

    // ── Simulation speed ────────────────────────────────────
    let simSpeed = 1.0;
    const getSpeed = () => simSpeed;
    const setSpeed = v => { simSpeed = v; };

    // ── UI ──────────────────────────────────────────────────
    const ui = new UIController(vehicleMgr, trafficSystem, aiCtrl, statsTracker, getSpeed, setSpeed);

    // Hook AI step callback into UI info line
    aiCtrl.onStep = (mode, info) => {
        const el = document.getElementById('algo-step-info');
        if (!el) return;
        if (mode === 'genetic')     el.textContent = `Gen ${info.gen} | fit ${info.fitness}`;
        else if (mode === 'astar')  el.textContent = `Nodes expanded: ${info.expanded}`;
        else if (mode === 'hillclimbing') el.textContent = `Adjusted ${info.improved} intersections`;
        else if (mode === 'csp')    el.textContent = `${info.vars} variables solved`;
    };

    // ── Night mode ──────────────────────────────────────────
    document.addEventListener('toggleNight', (e) => {
        const n = e.detail;
        if (n) {
            scene.background.setHex(0x0a0a1a);
            scene.fog.color.setHex(0x0a0a1a);
            ambient.intensity = 0.15;
            sun.intensity = 0.1;
            fill.intensity = 0.05;
            renderer.toneMappingExposure = 0.6;
        } else {
            scene.background.setHex(0x87ceeb);
            scene.fog.color.setHex(0x87ceeb);
            ambient.intensity = 0.55;
            sun.intensity = 1.2;
            fill.intensity = 0.3;
            renderer.toneMappingExposure = 1.0;
        }
        trafficSystem.setNight(n);
        vehicleMgr.setNight(n);
    });

    // ── Resize ──────────────────────────────────────────────
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ── Animation loop ──────────────────────────────────────
    let lastT = performance.now();
    function animate(now) {
        requestAnimationFrame(animate);
        const rawDt = Math.min((now - lastT) / 1000, 0.05);
        lastT = now;
        const dt = rawDt * simSpeed;

        trafficSystem.updateQueues(vehicleMgr.cars); // refresh NS/EW waiting counts for demand-responsive logic
        trafficSystem.update(dt);
        aiCtrl.update(dt);
        vehicleMgr.update(dt);
        ui.update(rawDt);      // UI timer uses real time
        controls.update();
        renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
})();
