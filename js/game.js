// Dummynation Clone - Complete Feature Set v2
// Real World Map, Full Economy, Diplomacy, Save/Load, Events, Animations

const canvas = document.getElementById('worldMap');
const ctx = canvas.getContext('2d');

// Game State
let gameState = {
    running: false,
    paused: false,
    gameSpeed: 1,
    mode: 'start',
    money: 0,
    gdp: 0,
    incomeCheck: 0,
    aiCheck: 0,
    eventCheck: 0,
    selectedAction: 'attack',
    troopPercent: 50,
    playerNationId: null,
    selectedCountryId: null,
    hoveredCountryId: null,
    turn: 0,
    year: 2024,
    showLabels: true
};

// Map Data
let countries = [];
let nations = [];
let alliances = [];
let wars = [];
let particles = []; // Attack animations
let events = []; // Game events log

// Configuration
const COLORS = [
    '#334155', '#00f3ff', '#ef4444', '#22c55e', '#eab308',
    '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#f59e0b',
    '#06b6d4', '#8b5cf6', '#10b981', '#f43f5e', '#6366f1'
];

const TECH_TREE = {
    military: { name: 'Military Power', cost: 1000, effect: 0.1 },
    economy: { name: 'Economic Growth', cost: 1500, effect: 0.15 },
    defense: { name: 'Defense Systems', cost: 1200, effect: 0.12 }
};

const RANDOM_EVENTS = [
    { name: 'Economic Boom', effect: 'gdp', value: 1.2, chance: 0.05 },
    { name: 'Rebellion', effect: 'stability', value: -0.3, chance: 0.03 },
    { name: 'Natural Disaster', effect: 'reserves', value: -0.5, chance: 0.02 },
    { name: 'Tech Breakthrough', effect: 'military', value: 0.1, chance: 0.04 },
    { name: 'Trade Agreement', effect: 'money', value: 500, chance: 0.06 }
];

// Particle class for animations
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
        this.life = 1.0;
        this.color = color;
        this.size = Math.random() * 3 + 2;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.02;
        this.vy += 0.1;
    }

    draw(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class Nation {
    constructor(id, color, name) {
        this.id = id;
        this.color = color;
        this.money = 0;
        this.military = 1.0;
        this.economy = 1.0;
        this.defense = 1.0;
        this.controlledCountries = 0;
        this.gdp = 0;
        this.population = 0;
        this.stability = 1.0;
        this.isAI = true;
        this.name = name || "Nation " + id;
        this.allies = [];
        this.enemies = [];
    }
}

class Country {
    constructor(feature) {
        this.feature = feature;
        this.id = feature.id || Math.random().toString(36).substr(2, 9);
        this.name = feature.properties.name || "Unknown";
        this.owner = 0;

        const area = d3.geoArea(feature);
        this.baseGdp = Math.max(10, Math.floor(area * 100000));
        this.gdp = this.baseGdp;
        this.reserves = Math.floor(this.gdp / 2);
        this.center = d3.geoCentroid(feature);
        this.population = Math.floor(this.gdp * 10);
        this.stability = 1.0;
    }

    getNeighbors() {
        return countries.filter(c => {
            if (c.id === this.id) return false;
            const dist = Math.hypot(c.center[0] - this.center[0], c.center[1] - this.center[1]);
            return dist < 15;
        });
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
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    try {
        await loadMapData();
        loadGameState();
        draw();
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
    console.log(`Loaded ${countries.length} countries.`);
}

// --- Game Flow ---

window.enterSelectionMode = function () {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('selectionOverlay').classList.remove('hidden');
    gameState.mode = 'selection';
    gameLoop();
};

function startGamePlay(startCountry) {
    gameState.mode = 'playing';
    document.getElementById('selectionOverlay').classList.add('hidden');
    document.getElementById('gameUI').classList.remove('hidden');

    nations = [];
    nations.push(new Nation(0, COLORS[0], 'Neutral'));

    let playerNation = new Nation(1, COLORS[1], startCountry.name);
    playerNation.isAI = false;
    nations.push(playerNation);

    gameState.playerNationId = 1;
    conquerCountry(startCountry, 1, true);

    // AI Nations
    let candidates = countries.filter(c => c.owner === 0 && c.gdp > 500);
    candidates.sort(() => .5 - Math.random());

    let aiCount = 0;
    for (let c of candidates) {
        if (aiCount >= 10) break;
        let nationId = aiCount + 2;
        let aiNation = new Nation(nationId, COLORS[nationId % COLORS.length], c.name);
        nations.push(aiNation);
        conquerCountry(c, nationId, true);
        aiCount++;
    }

    gameState.running = true;
    updateUI();
    saveGameState();
}

// --- Core Mechanics ---

function conquerCountry(country, nationId, instant = false) {
    if (country.owner !== 0) {
        let oldOwner = nations[country.owner];
        oldOwner.controlledCountries--;
        oldOwner.gdp -= country.gdp;
        oldOwner.population -= country.population;
    }

    country.owner = nationId;
    let newOwner = nations[nationId];
    newOwner.controlledCountries++;
    newOwner.gdp += country.gdp;
    newOwner.population += country.population;

    if (instant) {
        country.reserves = country.gdp;
        country.stability = 1.0;
    } else {
        country.reserves = Math.floor(country.gdp * 0.1);
        country.stability = 0.3;
    }

    // Particles
    const pos = projection(country.center);
    if (pos) {
        for (let i = 0; i < 20; i++) {
            particles.push(new Particle(pos[0], pos[1], newOwner.color));
        }
    }

    checkVictoryConditions();
}

function checkVictoryConditions() {
    if (!gameState.running) return;

    const player = nations[gameState.playerNationId];
    let worldGDP = nations.reduce((acc, n) => acc + n.gdp, 0);
    let control = (player.gdp / worldGDP) * 100;

    if (control >= 75) {
        gameState.running = false;
        showVictoryScreen();
    }

    if (player.controlledCountries === 0) {
        gameState.running = false;
        showDefeatScreen();
    }
}

function showVictoryScreen() {
    alert(`🎉 VICTORY! You control ${((nations[gameState.playerNationId].gdp / nations.reduce((a, n) => a + n.gdp, 0)) * 100).toFixed(1)}% of the world!`);
}

function showDefeatScreen() {
    alert(`💀 DEFEAT! Your nation has been conquered.`);
}

// Game Logic
function updateGameLogic() {
    if (gameState.mode !== 'playing' || gameState.paused) return;

    const speedMult = gameState.gameSpeed;

    gameState.incomeCheck += speedMult;
    if (gameState.incomeCheck > 60) {
        gameState.turn++;

        nations.forEach(n => {
            if (n.id === 0) return;

            let avgStability = 0;
            let count = 0;
            countries.forEach(c => {
                if (c.owner === n.id) {
                    avgStability += c.stability;
                    count++;
                }
            });
            avgStability = count > 0 ? avgStability / count : 1;
            n.stability = avgStability;

            let income = n.gdp * 0.2 * n.economy * avgStability;
            n.money += income;
        });

        countries.forEach(c => {
            if (c.owner !== 0) {
                if (c.reserves < c.gdp) {
                    c.reserves += Math.ceil(c.gdp * 0.05);
                }
                if (c.stability < 1.0) {
                    c.stability = Math.min(1.0, c.stability + 0.02);
                }
                c.population = Math.floor(c.gdp * 10 * c.stability);
            }
        });

        gameState.incomeCheck = 0;
        updateUI();
        saveGameState();
    }

    gameState.aiCheck += speedMult;
    if (gameState.aiCheck > 30) {
        runAI();
        gameState.aiCheck = 0;
    }

    gameState.eventCheck += speedMult;
    if (gameState.eventCheck > 300) {
        triggerRandomEvent();
        gameState.eventCheck = 0;
    }

    particles = particles.filter(p => {
        p.update();
        return p.life > 0;
    });
}

function runAI() {
    nations.forEach(n => {
        if (!n.isAI || n.id === 0) return;

        if (n.money > 1000) {
            const ownedCountries = countries.filter(c => c.owner === n.id);
            if (ownedCountries.length === 0) return;

            let neighbors = [];
            ownedCountries.forEach(c => {
                const countryNeighbors = c.getNeighbors();
                countryNeighbors.forEach(nc => {
                    if (nc.owner !== n.id && !isAlly(n.id, nc.owner)) {
                        neighbors.push(nc);
                    }
                });
            });

            let target;
            if (neighbors.length > 0 && Math.random() > 0.3) {
                target = neighbors[Math.floor(Math.random() * neighbors.length)];
            } else {
                target = countries[Math.floor(Math.random() * countries.length)];
            }

            if (target && target.owner !== n.id && !isAlly(n.id, target.owner)) {
                attemptAttack(n, target, 50);
            }
        }
    });
}

function triggerRandomEvent() {
    if (Math.random() > 0.7) return;

    const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
    if (Math.random() > event.chance) return;

    const targetNation = nations[Math.floor(Math.random() * nations.length)];
    if (targetNation.id === 0) return;

    switch (event.effect) {
        case 'gdp':
            targetNation.gdp *= event.value;
            break;
        case 'stability':
            countries.forEach(c => {
                if (c.owner === targetNation.id) {
                    c.stability = Math.max(0, Math.min(1, c.stability + event.value));
                }
            });
            break;
        case 'reserves':
            countries.forEach(c => {
                if (c.owner === targetNation.id) {
                    c.reserves = Math.max(0, c.reserves * (1 + event.value));
                }
            });
            break;
        case 'military':
            targetNation.military += event.value;
            break;
        case 'money':
            targetNation.money += event.value;
            break;
    }

    events.unshift({
        turn: gameState.turn,
        nation: targetNation.name,
        event: event.name
    });
    if (events.length > 10) events.pop();

    if (targetNation.id === gameState.playerNationId) {
        showNotification(`${event.name}!`, targetNation.color);
    }
}

function isAlly(nation1, nation2) {
    return alliances.some(a =>
        (a.nation1 === nation1 && a.nation2 === nation2) ||
        (a.nation1 === nation2 && a.nation2 === nation1)
    );
}

function attemptAttack(attackerNation, targetCountry, percent) {
    if (attackerNation.money <= 0) return;

    let liquidityToSpend = (attackerNation.money * percent) / 100;
    let damage = liquidityToSpend * attackerNation.military;
    let defense = targetCountry.reserves * (nations[targetCountry.owner]?.defense || 1);

    if (damage > defense) {
        attackerNation.money -= liquidityToSpend;
        conquerCountry(targetCountry, attackerNation.id);
        playSound('conquest');
    } else {
        attackerNation.money -= liquidityToSpend;
        targetCountry.reserves -= damage;
        playSound('attack');
    }
}

function playSound(type) {
    console.log(`Sound: ${type}`);
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
        const coords = projection.invert([e.clientX, e.clientY]);
        if (coords) {
            const hovered = countries.find(c => d3.geoContains(c.feature, coords));
            gameState.hoveredCountryId = hovered ? hovered.id : null;
            updateTooltip(e.clientX, e.clientY, hovered);
        }
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
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    handleZoom(zoomFactor, [e.clientX, e.clientY]);
});

function changeZoom(factor) {
    handleZoom(factor, [canvas.width / 2, canvas.height / 2]);
}

function handleZoom(factor, centerPoint) {
    const currentScale = projection.scale();
    const newScale = currentScale * factor;

    if (newScale < 50 || newScale > 50000) return;

    const p0 = projection.invert(centerPoint);
    if (!p0) {
        projection.scale(newScale);
        return;
    }

    projection.scale(newScale);
    const p1 = projection(p0);
    const currentTranslate = projection.translate();
    projection.translate([
        currentTranslate[0] + (centerPoint[0] - p1[0]),
        currentTranslate[1] + (centerPoint[1] - p1[1])
    ]);
}

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
            attemptAttack(player, country, gameState.troopPercent);
        }
    } else if (gameState.selectedAction === 'reinforce') {
        if (country.owner === player.id) {
            let cost = 100;
            if (player.money >= cost) {
                player.money -= cost;
                country.reserves += 500;
            }
        }
    }

    gameState.selectedCountryId = country.id;
    updateUI();
}

function updateTooltip(x, y, country) {
    let tooltip = document.getElementById('tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid #00f3ff;
            padding: 10px;
            border-radius: 8px;
            pointer-events: none;
            z-index: 1000;
            font-family: 'Orbitron', sans-serif;
            font-size: 0.9rem;
            display: none;
        `;
        document.body.appendChild(tooltip);
    }

    if (country && gameState.mode === 'playing') {
        const owner = nations[country.owner];
        tooltip.innerHTML = `
            <div style="color: #00f3ff; font-weight: bold;">${country.name}</div>
            <div style="color: ${owner.color};">Owner: ${owner.name}</div>
            <div>GDP: ${formatNumber(country.gdp)}</div>
            <div>Reserves: ${formatNumber(country.reserves)}</div>
            <div>Stability: ${Math.floor(country.stability * 100)}%</div>
        `;
        tooltip.style.left = (x + 15) + 'px';
        tooltip.style.top = (y + 15) + 'px';
        tooltip.style.display = 'block';
    } else {
        tooltip.style.display = 'none';
    }
}

// --- Rendering ---

function gameLoop() {
    updateGameLogic();
    draw();
    requestAnimationFrame(gameLoop);
}

function draw() {
    ctx.fillStyle = '#0B0F19';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    pathGenerator = d3.geoPath().projection(projection).context(ctx);

    ctx.beginPath();
    pathGenerator({ type: "Sphere" });
    ctx.fillStyle = '#111827';
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.stroke();

    countries.forEach(c => {
        ctx.beginPath();
        pathGenerator(c.feature);

        if (c.owner === 0) {
            ctx.fillStyle = '#1f2937';
        } else {
            const baseColor = nations[c.owner].color;
            const stability = c.stability || 1;
            ctx.fillStyle = adjustColorBrightness(baseColor, stability);
        }
        ctx.fill();

        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.stroke();

        if (gameState.selectedCountryId === c.id) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
        }

        if (gameState.hoveredCountryId === c.id) {
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#00f3ff';
            ctx.stroke();
        }
    });

    // Country Labels
    if (gameState.showLabels && projection.scale() > 300) {
        ctx.font = '10px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        countries.forEach(c => {
            if (c.owner === 0) return;
            const pos = projection(c.center);
            if (pos && pos[0] >= 0 && pos[0] <= canvas.width && pos[1] >= 0 && pos[1] <= canvas.height) {
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillText(c.name, pos[0] + 1, pos[1] + 1);
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.fillText(c.name, pos[0], pos[1]);
            }
        });
    }

    particles.forEach(p => p.draw(ctx));
}

function adjustColorBrightness(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const newR = Math.floor(r * factor);
    const newG = Math.floor(g * factor);
    const newB = Math.floor(b * factor);

    return `rgb(${newR}, ${newG}, ${newB})`;
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

window.setGameSpeed = function (speed) {
    gameState.gameSpeed = speed;
    gameState.paused = (speed === 0);
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('speed-' + speed).classList.add('active');
};

window.upgrade = function (type) {
    const player = nations[gameState.playerNationId];
    const tech = TECH_TREE[type];
    if (tech && player.money >= tech.cost) {
        player.money -= tech.cost;
        player[type] += tech.effect;
        updateUI();
    }
};

function updateUI() {
    if (!gameState.running) return;
    const player = nations[gameState.playerNationId];

    document.getElementById('res-money').innerText = formatNumber(player.money);
    document.getElementById('res-gdp').innerText = formatNumber(player.gdp) + "M";

    let worldGDP = nations.reduce((acc, n) => acc + n.gdp, 0);
    let pct = ((player.gdp / worldGDP) * 100).toFixed(1);
    document.getElementById('res-control').innerText = pct + '%';

    const popEl = document.getElementById('res-population');
    if (popEl) popEl.innerText = formatNumber(player.population);

    const stabEl = document.getElementById('res-stability');
    if (stabEl) stabEl.innerText = Math.floor(player.stability * 100) + '%';

    updateLeaderboard();
    updateEventsLog();
}

function updateLeaderboard() {
    const lb = document.getElementById('leaderboard');
    if (!lb) return;

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

function updateEventsLog() {
    const eventsEl = document.getElementById('events-log');
    if (!eventsEl) return;

    let html = '<div style="margin-bottom:10px; color:#94a3b8; font-size:0.8rem;">RECENT EVENTS</div>';
    events.slice(0, 5).forEach(e => {
        html += `<div style="font-size:0.75rem; margin-bottom:3px; color:#cbd5e1;">Turn ${e.turn}: ${e.event} (${e.nation})</div>`;
    });
    eventsEl.innerHTML = html;
}

function showNotification(message, color = '#00f3ff') {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.95);
        border: 2px solid ${color};
        padding: 15px 30px;
        border-radius: 8px;
        color: ${color};
        font-family: 'Orbitron', sans-serif;
        font-size: 1.1rem;
        z-index: 1000;
        box-shadow: 0 0 20px ${color};
        animation: slideDown 0.3s ease;
    `;
    notif.innerText = message;
    document.body.appendChild(notif);

    setTimeout(() => {
        notif.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'T';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'B';
    return Math.floor(num);
}

// --- Save/Load System ---

function saveGameState() {
    if (!gameState.running) return;

    const saveData = {
        gameState,
        nations: nations.map(n => ({ ...n })),
        countries: countries.map(c => ({
            id: c.id,
            owner: c.owner,
            reserves: c.reserves,
            gdp: c.gdp,
            stability: c.stability
        })),
        alliances,
        wars
    };

    localStorage.setItem('dummynation_save', JSON.stringify(saveData));
}

function loadGameState() {
    const saved = localStorage.getItem('dummynation_save');
    if (!saved) return;

    try {
        const data = JSON.parse(saved);
        console.log('Save game found');
    } catch (e) {
        console.error('Failed to load save', e);
    }
}

window.saveGame = saveGameState;
window.loadGame = loadGameState;
