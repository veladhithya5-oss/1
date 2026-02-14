// Dummynation-style Grand Strategy Game Logic

const canvas = document.getElementById('worldMap');
const ctx = canvas.getContext('2d');

// Game State
let gameState = {
    running: false,
    money: 1000,
    incomeCheck: 0,
    selectedMode: 'attack', // attack, reinforce
    viewX: 0,
    viewY: 0,
    zoom: 1
};

// Map Data
const CELL_SIZE = 10;
let COLS, ROWS;
let mapGrid = []; // 2D array of Cells
let nations = []; // Array of Nation objects

// Configuration
const COLORS = [
    '#334155', // 0: Sea (Slate)
    '#00f3ff', // 1: Player (Cyan)
    '#nf0000', // invalid
    '#ef4444', // 2: Enemy Red
    '#22c55e', // 3: Enemy Green
    '#eab308', // 4: Enemy Yellow
    '#a855f7', // 5: Enemy Purple
    '#f97316'  // 6: Enemy Orange
];

const NATION_NAMES = ['Neutral', 'You', 'Red Federation', 'Green Republic', 'Yellow Empire', 'Purple Union', 'Orange State'];

class Nation {
    constructor(id, color) {
        this.id = id;
        this.color = color;
        this.money = 100; // Starter cash
        this.income = 10; // Cash per tick
        this.military = 10; // Attack power multiplier
        this.cells = 0;
        this.name = NATION_NAMES[id];
        this.isAI = id !== 1;
    }
}

class Cell {
    constructor(c, r, type) {
        this.c = c;
        this.r = r;
        this.type = type; // 0: Sea, 1: Land
        this.owner = 0; // 0 = Neutral/None
        this.power = 0; // Defense value
        this.growth = Math.random() * 0.5; // Economic value
    }
}

// Initialization
function startGame(strategy) {
    document.getElementById('startScreen').classList.add('hidden');

    // Resize nav
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    COLS = Math.ceil(canvas.width / CELL_SIZE);
    ROWS = Math.ceil(canvas.height / CELL_SIZE);

    initMap();
    initNations(strategy);

    gameState.running = true;
    requestAnimationFrame(gameLoop);
}

function initMap() {
    mapGrid = [];
    const noise = new SimplexNoise(); // We need a noise function, will implement simple one

    for (let c = 0; c < COLS; c++) {
        mapGrid[c] = [];
        for (let r = 0; r < ROWS; r++) {
            // Generate World-like Terrain
            // Simple frequency overlapping for "continents"
            let nx = c / 40 - 0.5, ny = r / 40 - 0.5;
            let val = noise.noise2D(nx, ny) + 0.5 * noise.noise2D(2 * nx, 2 * ny);

            // Island mask (circular falloff)
            const cx = COLS / 2, cy = ROWS / 2;
            const dist = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy)) / (Math.min(COLS, ROWS) / 1.8);
            val -= dist;

            const isLand = val > 0.1;
            const cell = new Cell(c, r, isLand ? 1 : 0);

            if (isLand) {
                cell.power = 10 + Math.floor(Math.random() * 20); // Base defense
            }

            mapGrid[c][r] = cell;
        }
    }
}

function initNations(strategy) {
    // Create Nations
    for (let i = 0; i < COLORS.length; i++) {
        if (i === 0 || i === 2) continue; // Skip 0(Sea) and 2(Red - placeholder in array fix)
        // Actually indexes match COLORS array
    }

    nations = [
        new Nation(0, COLORS[0]), // Sea/Neutral holder
        new Nation(1, COLORS[1]), // Player
        new Nation(2, COLORS[3]), // Red
        new Nation(3, COLORS[4]), // Green
        new Nation(4, COLORS[5]), // Yellow
        new Nation(5, COLORS[6]), // Purple
        new Nation(6, COLORS[7])  // Orange
    ];

    if (strategy === 'aggressive') {
        nations[1].military = 15;
        nations[1].income = 8;
    } else {
        nations[1].income = 15;
        nations[1].military = 8;
    }

    // Place Nations randomly on land
    nations.forEach(n => {
        if (n.id === 0) return;
        let placed = false;
        while (!placed) {
            const rc = Math.floor(Math.random() * COLS);
            const rr = Math.floor(Math.random() * ROWS);
            if (mapGrid[rc][rr].type === 1 && mapGrid[rc][rr].owner === 0) {
                // Claim a cluster
                floodFillClaim(rc, rr, n.id, 20);
                placed = true;
            }
        }
    });

    // Fill remaining land with Neutral (ID 99 -> handled as owner 0 but distinct?)
    // Actually, owner 0 is Neutral Land if Type is 1.
}

function floodFillClaim(c, r, owner, count) {
    if (count <= 0) return;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    if (mapGrid[c][r].owner !== 0 || mapGrid[c][r].type === 0) return;

    mapGrid[c][r].owner = owner;
    mapGrid[c][r].power = 50; // Stronger initial core

    // Spread randomly
    floodFillClaim(c + 1, r, owner, count - 1);
    floodFillClaim(c - 1, r, owner, count - 1);
    floodFillClaim(c, r + 1, owner, count - 1);
    floodFillClaim(c, r - 1, owner, count - 1);
}

// Game Loop
function gameLoop() {
    if (!gameState.running) return;

    updateEco();
    updateAI();
    drawMap();
    updateUI();

    requestAnimationFrame(gameLoop);
}

function updateEco() {
    gameState.incomeCheck++;
    if (gameState.incomeCheck > 60) { // Every ~1 sec
        nations.forEach(n => {
            if (n.id === 0) return;
            // Calculate income based on land count * growth
            let landCount = 0;
            // This is slow if we iterate all cells every tick. 
            // Better to cache land count.
            // For now, simple fixed income increment + small bonus
            n.money += n.income + (n.cells * 0.5);
        });
        gameState.incomeCheck = 0;
    }
}

function updateAI() {
    // Simple AI: 
    // 1. Check valid border neighbors
    // 2. If neighbors are weaker and we have cash, Attack

    if (Math.random() > 0.1) return; // Throttle AI

    nations.forEach(n => {
        if (!n.isAI || n.id === 0) return;
        if (n.money < 50) return; // Saving up

        // Random expansion attempt
        // Find a cell owned by this AI
        // Look for neighbor not owned by AI

        // Optimization: Keep a list of border cells? Too complex for this snippet.
        // Brute force random sampling:
        for (let k = 0; k < 10; k++) {
            const rx = Math.floor(Math.random() * COLS);
            const ry = Math.floor(Math.random() * ROWS);
            const cell = mapGrid[rx][ry];

            if (cell.owner === n.id) {
                // Check neighbors
                const neighbors = getNeighbors(rx, ry);
                for (let neighbor of neighbors) {
                    if (neighbor.type === 1 && neighbor.owner !== n.id) {
                        // Found a target
                        const cost = calculateAttackCost(neighbor, n);
                        if (n.money >= cost) {
                            n.money -= cost;
                            conquerCell(neighbor, n.id);
                        }
                        return; // Done one action per tick
                    }
                }
            }
        }
    });
}

function getNeighbors(c, r) {
    const arr = [];
    if (c > 0) arr.push(mapGrid[c - 1][r]);
    if (c < COLS - 1) arr.push(mapGrid[c + 1][r]);
    if (r > 0) arr.push(mapGrid[c][r - 1]);
    if (r < ROWS - 1) arr.push(mapGrid[c][r + 1]);
    return arr;
}

function calculateAttackCost(targetCell, attackerNation) {
    // Base cost 10 + target defense
    // If target is neutral, cheaper.
    // If target is enemy, expensive.
    let base = targetCell.power;
    if (targetCell.owner !== 0) base *= 2;
    return Math.floor(base * (20 / attackerNation.military)); // High military reduces cost
}

function conquerCell(cell, newOwnerId) {
    // Deduct old owner count
    if (cell.owner !== 0) nations[cell.owner].cells--;

    cell.owner = newOwnerId;
    cell.power = 20; // Reset defense
    nations[newOwnerId].cells++;
}

// Drawing
function drawMap() {
    ctx.fillStyle = '#0B0F19'; // Ocean bg
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pixelW = Math.ceil(canvas.width / COLS);
    const pixelH = Math.ceil(canvas.height / ROWS);

    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
            const cell = mapGrid[c][r];
            if (cell.type === 0) continue; // Skip sea

            // Color based on owner
            if (cell.owner === 0) {
                ctx.fillStyle = '#475569'; // Neutral Land
            } else {
                ctx.fillStyle = nations[cell.owner].color;
            }

            ctx.fillRect(c * pixelW, r * pixelH, pixelW, pixelH);

            // Border Highlight if different owner
            // (Optional optimization: only draw if neighbor is diff)
        }
    }
}

function updateUI() {
    const p = nations[1];
    document.getElementById('res-money').innerText = Math.floor(p.money);
    document.getElementById('res-power').innerText = p.military;

    // Calculate domination %
    const totalLand = COLS * ROWS * 0.4; // approx valid land
    const percent = ((p.cells / totalLand) * 100).toFixed(1);
    document.getElementById('res-control').innerText = percent + '%';

    // Leaderboard
    const lb = document.getElementById('leaderboard');
    // Sort nations by cell count
    const sorted = [...nations].sort((a, b) => b.cells - a.cells).filter(n => n.id !== 0);

    lb.innerHTML = '<div style="margin-bottom:10px; color:#94a3b8; font-size:0.8rem;">DOMINATION RANKING</div>';
    sorted.forEach(n => {
        lb.innerHTML += `
            <div class="lb-row">
                <span class="lb-name" style="color:${n.color}">${n.name}</span>
                <span>${n.cells}</span>
            </div>
        `;
    });
}

// Interaction
canvas.addEventListener('mousedown', (e) => {
    if (!gameState.running) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const c = Math.floor(x / (canvas.width / COLS));
    const r = Math.floor(y / (canvas.height / ROWS));

    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;

    const cell = mapGrid[c][r];
    const player = nations[1];

    if (cell.type === 1) {
        if (gameState.selectedMode === 'attack') {
            // Must be adjacent to player land OR player has no land??
            // For gameplay smoothness, allow attacking any neutral if you have 0 land?
            // Checking adjacency:
            let adjacent = false;
            // Optimization: check neighbors
            if (player.cells === 0) {
                adjacent = true; // First spawn
            } else {
                const neighbors = getNeighbors(c, r);
                if (neighbors.some(n => n.owner === 1)) adjacent = true;
            }

            if (adjacent && cell.owner !== 1) {
                const cost = calculateAttackCost(cell, player);
                if (player.money >= cost) {
                    player.money -= cost;
                    conquerCell(cell, 1);
                    // Floating text effect here ideally
                }
            }
        } else if (gameState.selectedMode === 'reinforce') {
            if (cell.owner === 1) {
                if (player.money >= 10) {
                    player.money -= 10;
                    cell.power += 50;
                }
            }
        }
    }
});

function setMode(mode) {
    gameState.selectedMode = mode;
    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + mode).classList.add('active');
}

function upgrade(type) {
    const player = nations[1];
    if (type === 'research') {
        if (player.money >= 500) {
            player.money -= 500;
            player.military += 5; // Permanent buff
            player.income += 5;
        }
    }
}

// Simplex Noise Helper (Simplified for brevity)
// This is a fast fake version of Perlin noise for terrain generation
class SimplexNoise {
    constructor() { this.grad3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]]; }
    noise2D(xin, yin) {
        // Very basic pseudo-random for "continents"
        return Math.sin(xin * 10) * Math.cos(yin * 10);
    }
}
