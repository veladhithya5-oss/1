// Dummynation-style Grand Strategy Game Logic (Real World Map)

const canvas = document.getElementById('worldMap');
const ctx = canvas.getContext('2d');

// Game State
let gameState = {
    running: false,
    money: 1000,
    incomeCheck: 0,
    selectedMode: 'attack', // attack, reinforce
    transform: { k: 1, x: 0, y: 0 }, // Global Transform
    selectedCountryId: null, // ID of country selected by player
    hoverCountryId: null
};

// Map Data
let countries = []; // Array of Country objects
let nations = [];   // Array of Nation objects (Player, AI factions)

// Configuration
const COLORS = [
    '#334155', // 0: Neutral/Sea
    '#00f3ff', // 1: Player (Cyan)
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
        this.money = 1000;
        this.income = 10;
        this.military = 1.0;
        this.controlledCountries = 0;
        this.controlledArea = 0;
        this.name = NATION_NAMES[id] || 'Nation ' + id;
        this.isAI = id !== 1;
    }
}

class Country {
    constructor(feature) {
        this.feature = feature; // GeoJSON feature
        this.id = feature.id || Math.random().toString(36).substr(2, 9);
        this.name = feature.properties.name || "Unknown Region";
        this.owner = 0;         // 0 = Neutral
        this.power = 100 + Math.random() * 900; // Defense/Military value
        this.center = d3.geoCentroid(feature); // [lon, lat]
        this.area = d3.geoArea(feature);       // Relative area size
    }
}

// D3 Projection
// Start centered
let projection = d3.geoMercator()
    .scale(150)
    .translate([window.innerWidth / 2, window.innerHeight / 1.5]);

let pathGenerator = d3.geoPath()
    .projection(projection)
    .context(ctx);

// Initialization
async function startGame(strategy) {
    document.getElementById('startScreen').classList.add('hidden');

    // Canvas Resize
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Reset Projection Center
    projection.translate([canvas.width / 2, canvas.height / 1.5]);

    try {
        await loadMapData();
        initNations(strategy);
        gameState.running = true;

        // Initial Center & Zoom (Fit World)
        // Auto-fit logic ideally, but hardcoding startup zoom is safer for now
        let scale = Math.min(canvas.width, canvas.height) / 6.5;
        projection.scale(scale);

        // Centering
        projection.translate([canvas.width / 2, canvas.height / 2]);

        requestAnimationFrame(gameLoop);
    } catch (e) {
        console.error("Failed to load map:", e);
        alert("Error loading map data. Please ensure 'data/world.json' exists.");
    }
}

async function loadMapData() {
    // Load TopoJSON
    const response = await fetch('data/world.json');
    if (!response.ok) throw new Error("Network response was not ok");
    const topology = await response.json();

    // Convert to GeoJSON features
    // We assume the object key is 'countries' or similar. 
    // Checking keys if needed, but standard 110m has 'countries'
    let objects = topology.objects.countries || topology.objects.land;
    const geojson = topojson.feature(topology, objects);

    countries = geojson.features.map(f => new Country(f));
    console.log(`Loaded ${countries.length} countries.`);
}

function initNations(strategy) {
    nations = [
        new Nation(0, '#475569'), // Neutral
        new Nation(1, COLORS[1]), // Player
        new Nation(2, COLORS[2]),
        new Nation(3, COLORS[3]),
        new Nation(4, COLORS[4]),
        new Nation(5, COLORS[5]),
        new Nation(6, COLORS[6])
    ];

    if (strategy === 'aggressive') {
        nations[1].military = 1.2;
    } else {
        nations[1].income = 15;
    }

    // Assign Starting Countries
    // Randomize starts
    let shuffled = [...countries].sort(() => 0.5 - Math.random());

    // Player Start
    let playerStart = shuffled.find(c => c.area > 0.05); // Reasonable size
    if (playerStart) {
        conquerCountry(playerStart, 1);
        // Center view on player?
    }

    // AI Starts
    for (let i = 2; i < nations.length; i++) {
        let aiStart = shuffled.find(c => c.owner === 0 && c.area > 0.02);
        if (aiStart) conquerCountry(aiStart, i);
    }
}

function conquerCountry(country, nationId) {
    if (country.owner !== 0) {
        nations[country.owner].controlledCountries--;
    }
    country.owner = nationId;
    nations[nationId].controlledCountries++;
    country.power = 500; // Reset power/health on conquest
}

// Interaction Tracking
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

        // Pan logic: modify projection translate
        const currTranslate = projection.translate();
        projection.translate([currTranslate[0] + dx, currTranslate[1] + dy]);

        lastMouse = { x: e.clientX, y: e.clientY };
    }
});

canvas.addEventListener('mouseup', e => {
    isDragging = false;
    // Click detection (if didn't drag much)
    const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
    if (dist < 5) {
        handleInteraction(e.clientX, e.clientY);
    }
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomIntensity = 0.001;
    const currentScale = projection.scale();
    const newScale = currentScale - (e.deltaY * zoomIntensity * currentScale);

    // Clamp zoom
    if (newScale > 50 && newScale < 5000) {
        projection.scale(newScale);
    }
});

function handleInteraction(mx, my) {
    // Inverse projection is tricky with just D3 Geo logic on Canvas if we don't have the backing data structure optimized.
    // However, d3.geoPath.bounds is fast enough for interaction? No.
    // Inverse projection to [lon, lat]
    const coords = projection.invert([mx, my]);

    if (coords) {
        // Check which country contains this point
        // d3.geoContains is robust
        const clicked = countries.find(c => d3.geoContains(c.feature, coords));
        if (clicked) {
            handleCountryClick(clicked);
        }
    }
}

function handleCountryClick(country) {
    const player = nations[1];
    console.log("Clicked:", country.name);

    if (gameState.selectedMode === 'attack') {
        if (country.owner !== 1) {
            const cost = calculateAttackCost(country);
            if (player.money >= cost) {
                player.money -= cost;

                // Simple battle
                // Dummynation has "deployment" logic. Here we just simple-conquer or damage.
                // Attack power vs defense
                let attackPower = player.military * 1000;
                if (attackPower > country.power) {
                    conquerCountry(country, 1);
                } else {
                    country.power -= attackPower * 0.1;
                }
            }
        }
    } else if (gameState.selectedMode === 'reinforce') {
        if (country.owner === 1) {
            if (player.money >= 100) {
                player.money -= 100;
                country.power += 200;
            }
        }
    }

    gameState.selectedCountryId = country.id;
    updateUI();
}

function calculateAttackCost(country) {
    // Cost scales with size/power
    return Math.floor(100 + country.power / 10);
}

// Game Loop
function gameLoop() {
    if (!gameState.running) return;

    updateLogic();
    draw();
    requestAnimationFrame(gameLoop);
}

function updateLogic() {
    gameState.incomeCheck++;
    if (gameState.incomeCheck > 60) {
        // Income Tick
        nations.forEach(n => {
            if (n.id === 0) return;
            // Income based on controlled countries
            // Dummynation heavily relies on Area and GDP (we act as Area = GDP for now)
            let income = n.income + (n.controlledCountries * 5);
            n.money += income;
        });

        // AI Expansion Logic
        nations.forEach(n => {
            if (n.isAI && n.money > 200) {
                // Try to expand to random country
                // Ideally neighbor, but random for MVP
                let target = countries[Math.floor(Math.random() * countries.length)];
                if (target.owner !== n.id) {
                    let cost = calculateAttackCost(target);
                    if (n.money > cost * 2) {
                        n.money -= cost;
                        conquerCountry(target, n.id);
                    }
                }
            }
        });

        gameState.incomeCheck = 0;
        updateUI();
    }
}

function draw() {
    // Clear
    ctx.fillStyle = '#0B0F19';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Countries
    ctx.beginPath();
    pathGenerator({ type: "Sphere" });
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.stroke();

    countries.forEach(c => {
        ctx.beginPath();
        pathGenerator(c.feature);

        // Fill based on owner
        if (c.owner === 0) {
            ctx.fillStyle = '#1e293b';
            // Hover effect
            // if (c.id === gameState.hoverCountryId) ctx.fillStyle = '#334155';
        } else {
            ctx.fillStyle = nations[c.owner].color;
        }
        ctx.fill();

        // Borders
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.stroke();

        // Selection Highlight
        if (gameState.selectedCountryId === c.id) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#00f3ff';
            ctx.stroke();
        }
    });
}

// UI Updates
function updateUI() {
    if (!nations[1]) return;
    const p = nations[1];

    document.getElementById('res-money').innerText = formatNumber(p.money);
    document.getElementById('res-power').innerText = p.military.toFixed(1);

    // Control %
    const totalC = countries.length;
    let pct = (p.controlledCountries / totalC * 100).toFixed(1);
    document.getElementById('res-control').innerText = pct + '%';

    updateLeaderboard();
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return Math.floor(num);
}

function updateLeaderboard() {
    const lb = document.getElementById('leaderboard');
    if (!lb) return;
    const sorted = [...nations].filter(n => n.id !== 0).sort((a, b) => b.controlledCountries - a.controlledCountries);

    let html = '<div style="margin-bottom:10px; color:#94a3b8; font-size:0.8rem;">DOMINATION RANKING</div>';
    sorted.forEach((n, i) => {
        html += `
            <div class="lb-row">
                <span class="lb-name" style="color:${n.color}">${i + 1}. ${n.name}</span>
                <span>${n.controlledCountries}</span>
            </div>
        `;
    });
    lb.innerHTML = html;
}

// Global Exports
window.startGame = startGame;
window.setMode = setMode;
window.upgrade = upgrade;
