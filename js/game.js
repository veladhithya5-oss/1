// Dummynation-like Game Logic
// Features: Real map, Liquidity, Troop Slider, D3 Rendering

const canvas = document.getElementById('worldMap');
const ctx = canvas.getContext('2d');

// Game State
let gameState = {
    running: false,
    mode: 'start', // start, selection, playing
    money: 0,
    gdp: 0,
    incomeCheck: 0,
    aiCheck: 0,
    selectedAction: 'attack', // attack, reinforce
    troopPercent: 50, // 1-100
    transform: { k: 1, x: 0, y: 0 },
    playerNationId: null,
    selectedCountryId: null
};

// Map Data
let countries = [];
let nations = [];

// Configuration
// Nation Colors (Dummynation style: vibrant, specific)
const COLORS = [
    '#334155', // 0: Neutral
    '#00f3ff', // 1: Player (Cyan)
    '#ef4444',
    '#22c55e',
    '#eab308',
    '#a855f7',
    '#f97316',
    '#ec4899',
    '#14b8a6'
];

class Nation {
    constructor(id, color, name) {
        this.id = id;
        this.color = color;
        this.money = 0; // Liquidity
        this.military = 1.0; // Tech multiplier
        this.controlledCountries = 0;
        this.gdp = 0; // Total economic power
        this.isAI = true;
        this.name = name || "Nation " + id;
    }
}

class Country {
    constructor(feature) {
        this.feature = feature;
        this.id = feature.id || Math.random().toString(36).substr(2, 9);
        this.name = feature.properties.name || "Unknown";
        this.owner = 0; // 0 = Neutral

        // Stats derived from area (proxy for GDP/Pop in this MVP)
        const area = d3.geoArea(feature);
        // Base GDP ~ area * constant
        this.baseGdp = Math.max(10, Math.floor(area * 100000));
        this.gdp = this.baseGdp;

        // Reserves (Troops stationed)
        this.reserves = Math.floor(this.gdp / 2);
    }
}

// D3 Setup
let projection = d3.geoMercator()
    .scale(150)
    .translate([window.innerWidth / 2, window.innerHeight / 1.5]);

let pathGenerator = d3.geoPath()
    .projection(projection)
    .context(ctx);

// --- Initialization ---

window.onload = async () => {
    // 1. Resizing
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 2. Load Data
    try {
        await loadMapData();
        draw(); // Initial draw (empty/neutral map)
    } catch (e) {
        console.error("Map Error", e);
    }
};

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    projection.translate([canvas.width / 2, canvas.height / 1.5]);
    if (gameState.running) draw();
}

async function loadMapData() {
    const response = await fetch('data/world.json');
    const topology = await response.json();
    const objects = topology.objects.countries || topology.objects.land;
    const geojson = topojson.feature(topology, objects);

    countries = geojson.features.map(f => new Country(f));

    // Auto-center map scale
    const b = d3.geoBounds(geojson);
    // Simple logic to fit width
    const s = 150; // base

    console.log(`Loaded ${countries.length} countries.`);
}

// --- Game Flow ---

window.enterSelectionMode = function () {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('selectionOverlay').classList.remove('hidden');
    gameState.mode = 'selection';

    // Zoom in a bit to encourage selection
    let targetK = 2;
    let center = [canvas.width / 2, canvas.height / 2];
    // We can animate this, but for now jump
    // gameState.transform.k = 2;
    // gameState.transform.x = ... 

    gameLoop();
};

function startGamePlay(startCountry) {
    gameState.mode = 'playing';
    document.getElementById('selectionOverlay').classList.add('hidden');
    document.getElementById('gameUI').classList.remove('hidden');

    // Init Nations
    // Nation 1 is Player
    nations = [];
    // 0: Neutral (Abstract)
    nations.push(new Nation(0, COLORS[0], 'Neutral'));

    // Create Player Nation based on started country
    let playerNation = new Nation(1, COLORS[1], startCountry.name);
    playerNation.isAI = false;
    nations.push(playerNation);

    gameState.playerNationId = 1;

    // Assign Player Country
    conquerCountry(startCountry, 1, true); // True = instant/free

    // Assign AI Nations (Randomly pick 5-6 strong countries)
    let candidates = countries.filter(c => c.owner === 0 && c.gdp > 500);
    // Shuffle
    candidates.sort(() => .5 - Math.random());

    let aiCount = 0;
    for (let c of candidates) {
        if (aiCount >= 7) break; // Limit AI nations
        let nationId = aiCount + 2;
        // Use real country name for AI nation too
        let aiNation = new Nation(nationId, COLORS[nationId % COLORS.length], c.name);
        nations.push(aiNation);

        conquerCountry(c, nationId, true);
        aiCount++;
    }

    gameState.running = true;
    updateUI();
}

// --- Core Mechanics ---

function conquerCountry(country, nationId, instant = false) {
    if (country.owner !== 0) {
        let oldOwner = nations[country.owner];
        oldOwner.controlledCountries--;
        oldOwner.gdp -= country.gdp;
    }

    country.owner = nationId;
    let newOwner = nations[nationId];
    newOwner.controlledCountries++;
    newOwner.gdp += country.gdp;

    if (instant) {
        country.reserves = country.gdp; // Full restore
    } else {
        country.reserves = Math.floor(country.gdp * 0.1); // Conquered lands are weak initially
    }
}

// Tick Logic (60fps)
function updateGameLogic() {
    if (gameState.mode !== 'playing') return;

    // Income Cycle (every 1 sec approx)
    gameState.incomeCheck++;
    if (gameState.incomeCheck > 60) {
        // Liquidity Growth based on GDP
        // Dummynation: Liquidity grows, but is capped or slows down. 
        // Spending liquidity sends troops.

        nations.forEach(n => {
            if (n.id === 0) return;
            // Income = GDP * Multiplier
            // Simple model:
            let income = n.gdp * 0.2; // Increased income rate
            n.money += income;
        });

        // Troop Replenishment in Countries
        countries.forEach(c => {
            if (c.owner !== 0) {
                // Reserves grow back to GDP cap
                if (c.reserves < c.gdp) {
                    c.reserves += Math.ceil(c.gdp * 0.05);
                }
            }
        });

        gameState.incomeCheck = 0;
        updateUI(); // Update UI numbers
    }

    // AI Logic Cycle (every 0.5 sec)
    gameState.aiCheck++;
    if (gameState.aiCheck > 30) {
        runAI();
        gameState.aiCheck = 0;
    }
}

function runAI() {
    nations.forEach(n => {
        if (!n.isAI || n.id === 0) return;

        // Simple AI: 
        // 1. Accumulate money
        // 2. Pick a random neighbor of any owned country (expensive to find)
        // Optimization: Just pick a random owned country, try to attack random global target 
        // (Dummynation allows global attacks usually, distance matters for cost)

        if (n.money > 1000) {
            // Try to attack
            // Pick random target that is NOT owner
            let target = countries[Math.floor(Math.random() * countries.length)];
            if (target.owner !== n.id) {
                attemptAttack(n, target, 50); // Commit 50%
            }
        }
    });
}

function attemptAttack(attackerNation, targetCountry, percent) {
    if (attackerNation.money <= 0) return;

    // Calculate Attack Power
    // Based on Liquidity spent
    let liquidityToSpend = (attackerNation.money * percent) / 100;

    // Cost calculation:
    // Distance penalty? For now, flat based on target strength.
    // Dummynation: You spend Liquidity to create an "Attack Force" derived from reserves?
    // Actually Dummynation: Liquidity buys gun power. Reserves are local HP.

    // Simplified:
    // Spend Liquidity -> Damage Target Reserves
    // If Target Reserves < 0 -> Conquer

    let damage = liquidityToSpend * attackerNation.military;

    // Defense Bonus
    let defense = targetCountry.reserves;

    // Result
    if (damage > defense) {
        // Successful Conquest
        attackerNation.money -= liquidityToSpend; // Cost is paid
        conquerCountry(targetCountry, attackerNation.id);
    } else {
        // Failed, but damaged
        attackerNation.money -= liquidityToSpend;
        targetCountry.reserves -= damage; // Reduce reserves
    }
}

// --- Interaction ---

let lastMouse = { x: 0, y: 0 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };

canvas.addEventListener('mousedown', e => {
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mousemove', e => {
    if (isDragging) {
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;

        const currTranslate = projection.translate();
        projection.translate([currTranslate[0] + dx, currTranslate[1] + dy]);

        lastMouse = { x: e.clientX, y: e.clientY };
    } else {
        // Hover Logic for Tooltips (Optional)
    }
});

canvas.addEventListener('mouseup', e => {
    isDragging = false;
    const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
    if (dist < 5) {
        handleClick(e.clientX, e.clientY);
    }
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    // Zoom towards mouse pointer
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    handleZoom(zoomFactor, [e.clientX, e.clientY]);
});

function changeZoom(factor) {
    // Zoom towards center of screen
    handleZoom(factor, [canvas.width / 2, canvas.height / 2]);
}

function handleZoom(factor, centerPoint) {
    const currentScale = projection.scale();
    const newScale = currentScale * factor;

    // Clamp zoom
    if (newScale < 50 || newScale > 50000) return;

    // 1. Get the coordinates of the centerPoint in the map's domain (lon/lat) *before* rescaling
    // projection.invert return [lon, lat]
    const p0 = projection.invert(centerPoint);

    // If we are pointing at empty space (off-globe), we just zoom to center of canvas
    if (!p0) {
        projection.scale(newScale);
        return;
    }

    // 2. Set the new scale
    projection.scale(newScale);

    // 3. Get where that same lon/lat projects to *now*
    const p1 = projection(p0);

    // 4. Translate projection to move p1 back to centerPoint
    const currentTranslate = projection.translate();
    projection.translate([
        currentTranslate[0] + (centerPoint[0] - p1[0]),
        currentTranslate[1] + (centerPoint[1] - p1[1])
    ]);
}

// Expose to window
window.changeZoom = changeZoom;

function handleClick(mx, my) {
    const coords = projection.invert([mx, my]);
    if (!coords) return;

    const clicked = countries.find(c => d3.geoContains(c.feature, coords));
    if (clicked) {
        if (gameState.mode === 'selection') {
            startGamePlay(clicked);
        } else if (gameState.mode === 'playing') {
            handleCountryAction(clicked);
        }
    }
}

function handleCountryAction(country) {
    const player = nations[gameState.playerNationId];

    if (gameState.selectedAction === 'attack') {
        if (country.owner !== player.id) {
            // Attack!
            // Sound effect trigger here
            attemptAttack(player, country, gameState.troopPercent);
        }
    } else if (gameState.selectedAction === 'reinforce') {
        // Boost reserves
        if (country.owner === player.id) {
            let cost = 100;
            if (player.money >= cost) {
                player.money -= cost;
                country.reserves += 500;
            }
        }
    }

    // Select for highlighting
    gameState.selectedCountryId = country.id;
    updateUI();
}

// --- Rendering ---

function gameLoop() {
    updateGameLogic();
    draw();
    requestAnimationFrame(gameLoop);
}

function draw() {
    // 1. Clear
    ctx.fillStyle = '#0B0F19';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Map Settings
    pathGenerator = d3.geoPath().projection(projection).context(ctx);

    // 3. Draw Sea/Sphere
    ctx.beginPath();
    pathGenerator({ type: "Sphere" });
    ctx.fillStyle = '#111827';
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.stroke();

    // 4. Draw Countries
    // Batch path generation if possible, but canvas context requires re-pathing for fill change
    countries.forEach(c => {
        ctx.beginPath();
        pathGenerator(c.feature);

        if (c.owner === 0) {
            ctx.fillStyle = '#1f2937';
        } else {
            ctx.fillStyle = nations[c.owner].color;
        }
        ctx.fill();

        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.stroke();

        // Highlight Selected
        if (gameState.selectedCountryId === c.id) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
        }
    });
}

// --- UI Helpers ---

window.setMode = function (mode) {
    gameState.selectedAction = mode;
    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + mode).classList.add('active');
};

window.updateSlider = function (val) {
    gameState.troopPercent = val;
    document.getElementById('troop-percent').innerText = val;
};

window.upgrade = function (type) {
    const player = nations[gameState.playerNationId];
    if (type === 'research') {
        if (player.money >= 1000) {
            player.money -= 1000;
            player.military += 0.1;
            updateUI();
        }
    }
};

function updateUI() {
    if (!gameState.running) return;
    const player = nations[gameState.playerNationId];

    document.getElementById('res-money').innerText = formatNumber(player.money);
    document.getElementById('res-gdp').innerText = formatNumber(player.gdp) + "M";

    // Calc control
    let worldGDP = nations.reduce((acc, n) => acc + n.gdp, 0); // Approx sum
    let pct = ((player.gdp / worldGDP) * 100).toFixed(1);
    document.getElementById('res-control').innerText = pct + '%';

    updateLeaderboard();
}

function updateLeaderboard() {
    const lb = document.getElementById('leaderboard');
    if (!lb) return;

    // Sort by GDP
    const sorted = [...nations].filter(n => n.id !== 0).sort((a, b) => b.gdp - a.gdp);

    let html = '<div style="margin-bottom:10px; color:#94a3b8; font-size:0.8rem;">POWER RANKING</div>';
    sorted.forEach((n, i) => {
        html += `
            <div class="lb-row">
                <span class="lb-name" style="color:${n.color}">${i + 1}. ${n.name}</span>
                <span>${formatNumber(n.gdp)}</span>
            </div>
        `;
    });
    lb.innerHTML = html;
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'T';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'B';
    return Math.floor(num);
}
