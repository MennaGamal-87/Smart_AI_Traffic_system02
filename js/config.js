// ============================================================
//  Global Configuration
// ============================================================
const CFG = {
    GRID: 5,      // 5×5 intersections
    SPACING: 80,     // distance between intersection centers
    ROAD_W: 18,     // total road width
    LANE_OFF: 4.5,    // lane center offset from road centre-line
    STOP_OFF: 12,     // stop-line distance from intersection centre
    EXIT_OFF: 10,     // "exited intersection" distance from centre
    CAR_SPEED: 14,     // base car speed (units/sec)
    MAX_CARS: 30,     // initial car count
    NS_GREEN: 18,     // seconds NS phase is green  (fixed baseline)
    EW_GREEN: 18,     // seconds EW phase is green  (fixed baseline)
    YELLOW: 3,      // yellow duration

    // ── AI controller ──────────────────────────────────────
    AI_INTERVAL: 5,    // seconds between AI optimisation steps
    MIN_GREEN: 8,    // minimum green time any direction can have
    MAX_GREEN: 40,   // maximum green time
    MAX_CYCLE: 46,   // ns_green + ew_green budget (excl. yellows)
};


CFG.HALF = (CFG.GRID - 1) / 2 * CFG.SPACING;   // 160
CFG.BLOCK_W = CFG.SPACING - CFG.ROAD_W;            //  62

/** Intersection centre X for column index c */
CFG.ixX = (c) => c * CFG.SPACING - CFG.HALF;
/** Intersection centre Z for row index r */
CFG.ixZ = (r) => r * CFG.SPACING - CFG.HALF;

// Direction enum
const DIR = { NORTH: 0, EAST: 1, SOUTH: 2, WEST: 3 };
const DIR_VEC = [
    { dx: 0, dz: -1 },   // NORTH  (−Z)
    { dx: 1, dz: 0 },   // EAST   (+X)
    { dx: 0, dz: 1 },   // SOUTH  (+Z)
    { dx: -1, dz: 0 },   // WEST   (−X)
];
// Which traffic-light axis a direction uses
const DIR_AXIS = ['NS', 'EW', 'NS', 'EW'];
// Initial yaw so the car mesh faces its direction
const DIR_YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
