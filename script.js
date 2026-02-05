(() => {
  const WORLD_SIZE = 5600;
  const INITIAL_PLAYER_MASS = 22;
  const DEFAULT_BOT_COUNT = 40;
  const FOOD_COUNT = 1100;
  const BASE_GAME_SPEED = 1.7;
  const BOT_NAMES = ["Nova", "Kraken", "Pixel", "Nébuleuse", "Turbo", "Yuzu", "Éclair", "Vortex", "Basilic", "Cerbère", "Saphir", "Panthère"];

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    level: document.getElementById("level"),
    xp: document.getElementById("xp"),
    xpFill: document.getElementById("xp-fill"),
    mass: document.getElementById("mass"),
    rank: document.getElementById("rank"),
    leaderboard: document.getElementById("leaderboard"),
    eventLog: document.getElementById("event-log"),
    overlay: document.getElementById("overlay"),
    startBtn: document.getElementById("start-btn"),
    botCountInput: document.getElementById("bot-count"),
    difficultySelect: document.getElementById("difficulty"),
  };

  const state = {
    running: false,
    keys: { z: false, q: false, s: false, d: false, shift: false },
    foods: [],
    bots: [],
    playerCells: [],
    pellets: [],
    particles: [],
    events: [],
    xp: 0,
    level: 1,
    xpToNext: 70,
    clock: 0,
    lastTime: 0,
    gameSpeed: BASE_GAME_SPEED,
    difficulty: 1,
    botTargetCount: DEFAULT_BOT_COUNT,
    lastSplitAt: -999,
    lastEjectAt: -999,
  };

  const player = {
    name: "Toi",
    color: "#5ce1ff",
    boostEnergy: 1,
  };

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function radiusFromMass(mass) {
    return Math.sqrt(mass) * 4.7;
  }

  function speedFromMass(mass) {
    return clamp(300 / Math.sqrt(mass), 40, 240);
  }

  function randomColor(hueBase = random(0, 360)) {
    const hue = (hueBase + random(-20, 20) + 360) % 360;
    return `hsl(${hue}, ${random(66, 92)}%, ${random(48, 66)}%)`;
  }

  function randomUnitVector() {
    const a = random(0, Math.PI * 2);
    return { x: Math.cos(a), y: Math.sin(a) };
  }

  function getPlayerMass() {
    return state.playerCells.reduce((sum, c) => sum + c.mass, 0);
  }

  function playerCenter() {
    const total = getPlayerMass() || 1;
    const x = state.playerCells.reduce((acc, c) => acc + c.x * c.mass, 0) / total;
    const y = state.playerCells.reduce((acc, c) => acc + c.y * c.mass, 0) / total;
    return { x, y };
  }

  function makeFood() {
    return { x: random(0, WORLD_SIZE), y: random(0, WORLD_SIZE), mass: random(0.8, 1.5), color: randomColor() };
  }

  function makePellet(x, y, dx, dy, mass = 2.7, owner = "player") {
    return { x, y, vx: dx * 340, vy: dy * 340, mass, owner, life: 2.7, color: owner === "player" ? "#8af3ff" : "#ffd6a6" };
  }

  function makeBot(index) {
    const mass = random(14, 55);
    const seed = random(0, 360);
    return {
      id: `bot-${index}`,
      name: `${BOT_NAMES[index % BOT_NAMES.length]}-${index + 1}`,
      x: random(0, WORLD_SIZE),
      y: random(0, WORLD_SIZE),
      vx: random(-40, 40),
      vy: random(-40, 40),
      mass,
      color: randomColor(seed),
      behaviorTimer: random(0, 0.7),
      desiredX: random(0, WORLD_SIZE),
      desiredY: random(0, WORLD_SIZE),
    };
  }

  function spawnPlayer() {
    const center = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
    state.playerCells = [{ id: `p-${Date.now()}`, x: center.x, y: center.y, vx: 0, vy: 0, mass: INITIAL_PLAYER_MASS, color: player.color, mergeCooldown: 0.5 }];
  }

  function initWorld() {
    state.foods = Array.from({ length: FOOD_COUNT }, () => makeFood());
    state.bots = Array.from({ length: state.botTargetCount }, (_, i) => makeBot(i));
    state.pellets = [];
    state.particles = [];
    state.events = ["Bienvenue dans l'arène !", "Nouveau mode rapide: split (E) + envoi de masse (A)."];
    spawnPlayer();
    player.boostEnergy = 1;
    state.xp = 0;
    state.level = 1;
    state.xpToNext = 70;
    state.clock = 0;
    state.lastSplitAt = -999;
    state.lastEjectAt = -999;
  }

  function addEvent(msg) {
    state.events.unshift(msg);
    state.events = state.events.slice(0, 8);
  }

  function gainXp(amount, reason) {
    state.xp += amount;
    while (state.xp >= state.xpToNext) {
      state.xp -= state.xpToNext;
      state.level += 1;
      state.xpToNext = Math.round(state.xpToNext * 1.25 + 24);
      const perCell = 2 / Math.max(1, state.playerCells.length);
      state.playerCells.forEach((c) => (c.mass += perCell));
      addEvent(`Niveau ${state.level} ! Vitesse + agressivité bots augmentées.`);
      state.gameSpeed = BASE_GAME_SPEED + (state.level - 1) * 0.04;
    }
    if (reason) addEvent(reason);
  }

  function handleKeyboard(down, event) {
    const key = event.key.toLowerCase();
    if (key in state.keys) {
      state.keys[key] = down;
      event.preventDefault();
    }
    if (key === "shift") state.keys.shift = down;

    if (down && key === "e") {
      splitPlayer();
      event.preventDefault();
    }
    if (down && key === "a") {
      ejectPlayerMass();
      event.preventDefault();
    }
  }

  window.addEventListener("keydown", (event) => handleKeyboard(true, event));
  window.addEventListener("keyup", (event) => handleKeyboard(false, event));

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function playerMoveDirection() {
    let dirX = 0;
    let dirY = 0;
    if (state.keys.z) dirY -= 1;
    if (state.keys.s) dirY += 1;
    if (state.keys.q) dirX -= 1;
    if (state.keys.d) dirX += 1;
    const length = Math.hypot(dirX, dirY) || 1;
    return { x: dirX / length, y: dirY / length };
  }

  function movePlayer(dt) {
    const dir = playerMoveDirection();
    const boost = state.keys.shift && player.boostEnergy > 0.05;

    if (boost) {
      player.boostEnergy = clamp(player.boostEnergy - dt * 0.62, 0, 1);
    } else {
      player.boostEnergy = clamp(player.boostEnergy + dt * 0.35, 0, 1);
    }

    const boostFactor = boost ? 2 : 1;

    state.playerCells.forEach((cell) => {
      const accel = speedFromMass(cell.mass) * state.gameSpeed * boostFactor * 6.3;
      cell.vx += dir.x * accel * dt;
      cell.vy += dir.y * accel * dt;

      cell.vx *= 0.84;
      cell.vy *= 0.84;
      cell.x = clamp(cell.x + cell.vx * dt, 0, WORLD_SIZE);
      cell.y = clamp(cell.y + cell.vy * dt, 0, WORLD_SIZE);
      cell.mergeCooldown = Math.max(0, cell.mergeCooldown - dt);
      cell.mass = Math.max(8, cell.mass - dt * 0.045);
    });

    mergePlayerCells();
  }

  function splitPlayer() {
    if (!state.running || state.playerCells.length >= 8) return;
    if (state.clock - state.lastSplitAt < 0.35) return;
    state.lastSplitAt = state.clock;

    const dir = playerMoveDirection();
    const launch = Math.hypot(dir.x, dir.y) > 0 ? dir : randomUnitVector();
    const newCells = [];
    let didSplit = false;

    for (const cell of state.playerCells) {
      if (cell.mass < 24) {
        newCells.push(cell);
        continue;
      }
      didSplit = true;
      const childMass = cell.mass * 0.5;
      cell.mass = childMass;
      cell.mergeCooldown = 4;
      const r = radiusFromMass(childMass);
      newCells.push(cell);
      newCells.push({
        id: `p-${Math.random()}`,
        x: clamp(cell.x + launch.x * r * 2.4, 0, WORLD_SIZE),
        y: clamp(cell.y + launch.y * r * 2.4, 0, WORLD_SIZE),
        vx: launch.x * 650,
        vy: launch.y * 650,
        mass: childMass,
        color: player.color,
        mergeCooldown: 4,
      });
      emitParticles(cell.x, cell.y, "#7cf0ff", 16);
      if (newCells.length >= 8) break;
    }

    if (didSplit) {
      state.playerCells = newCells;
      addEvent("Split activé (E) !");
    }
  }

  function ejectPlayerMass() {
    if (!state.running) return;
    if (state.clock - state.lastEjectAt < 0.08) return;
    state.lastEjectAt = state.clock;
    const dir = playerMoveDirection();
    const launch = Math.hypot(dir.x, dir.y) > 0 ? dir : randomUnitVector();

    let didEject = false;
    for (const cell of state.playerCells) {
      if (cell.mass < 18) continue;
      cell.mass -= 1.9;
      const r = radiusFromMass(cell.mass);
      const x = clamp(cell.x + launch.x * (r + 7), 0, WORLD_SIZE);
      const y = clamp(cell.y + launch.y * (r + 7), 0, WORLD_SIZE);
      state.pellets.push(makePellet(x, y, launch.x, launch.y, 2.7, "player"));
      didEject = true;
    }
    if (didEject) addEvent("Masse envoyée (A)");
  }

  function mergePlayerCells() {
    for (let i = 0; i < state.playerCells.length; i++) {
      for (let j = i + 1; j < state.playerCells.length; j++) {
        const a = state.playerCells[i];
        const b = state.playerCells[j];
        if (!a || !b) continue;
        if (a.mergeCooldown > 0 || b.mergeCooldown > 0) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const minD = (radiusFromMass(a.mass) + radiusFromMass(b.mass)) * 0.55;
        if (d < minD) {
          a.mass += b.mass;
          a.vx = (a.vx + b.vx) * 0.5;
          a.vy = (a.vy + b.vy) * 0.5;
          state.playerCells.splice(j, 1);
          j--;
        }
      }
    }
  }

  function nearestEntity(from, list) {
    let best = null;
    let bestDist = Infinity;
    for (const item of list) {
      const dist = (item.x - from.x) ** 2 + (item.y - from.y) ** 2;
      if (dist < bestDist) {
        best = item;
        bestDist = dist;
      }
    }
    return best;
  }

  function nearestThreat(bot) {
    let best = null;
    const playerAsThreats = state.playerCells;
    for (const entity of [...playerAsThreats, ...state.bots]) {
      if (entity === bot) continue;
      if (entity.mass <= bot.mass * (1.1 / state.difficulty + 1.02)) continue;
      const distance = Math.hypot(entity.x - bot.x, entity.y - bot.y);
      if (!best || distance < best.distance) best = { x: entity.x, y: entity.y, distance };
    }
    return best;
  }

  function nearestPrey(bot) {
    let best = null;
    for (const entity of state.playerCells) {
      if (bot.mass <= entity.mass * 1.12) continue;
      const distance = Math.hypot(entity.x - bot.x, entity.y - bot.y);
      if (!best || distance < best.distance) best = { x: entity.x, y: entity.y, distance };
    }
    return best;
  }

  function updateBotBehavior(bot, dt) {
    bot.behaviorTimer -= dt;
    if (bot.behaviorTimer <= 0) {
      bot.behaviorTimer = random(0.2, 0.7) / state.difficulty;
      const threat = nearestThreat(bot);
      const prey = nearestPrey(bot);
      const nearestFood = nearestEntity(bot, state.foods);

      if (threat && threat.distance < radiusFromMass(bot.mass) * 9) {
        bot.desiredX = clamp(bot.x - (threat.x - bot.x) * 3.6, 0, WORLD_SIZE);
        bot.desiredY = clamp(bot.y - (threat.y - bot.y) * 3.6, 0, WORLD_SIZE);
      } else if (prey && prey.distance < radiusFromMass(bot.mass) * 12) {
        bot.desiredX = prey.x;
        bot.desiredY = prey.y;
      } else if (nearestFood) {
        bot.desiredX = nearestFood.x + random(-45, 45);
        bot.desiredY = nearestFood.y + random(-45, 45);
      } else {
        bot.desiredX = random(0, WORLD_SIZE);
        bot.desiredY = random(0, WORLD_SIZE);
      }
    }

    const dirX = bot.desiredX - bot.x;
    const dirY = bot.desiredY - bot.y;
    const len = Math.hypot(dirX, dirY) || 1;
    const speed = speedFromMass(bot.mass) * state.gameSpeed * (0.8 + state.difficulty * 0.35);

    bot.vx += (dirX / len) * speed * dt * 6.5;
    bot.vy += (dirY / len) * speed * dt * 6.5;
    bot.vx *= 0.86;
    bot.vy *= 0.86;
    bot.x = clamp(bot.x + bot.vx * dt, 0, WORLD_SIZE);
    bot.y = clamp(bot.y + bot.vy * dt, 0, WORLD_SIZE);
    bot.mass = Math.max(8, bot.mass - dt * 0.038);
  }

  function consumeFood(entity, dt, gainFactor = 1) {
    const r = radiusFromMass(entity.mass);
    for (let i = state.foods.length - 1; i >= 0; i--) {
      const food = state.foods[i];
      const dist = Math.hypot(food.x - entity.x, food.y - entity.y);
      if (dist < r + 2) {
        entity.mass += food.mass * gainFactor;
        state.foods[i] = makeFood();
        emitParticles(food.x, food.y, food.color, 2);
        if (state.playerCells.includes(entity)) gainXp(1.25, null);
      }
    }
  }

  function updatePellets(dt) {
    for (let i = state.pellets.length - 1; i >= 0; i--) {
      const p = state.pellets[i];
      p.life -= dt;
      p.x = clamp(p.x + p.vx * dt, 0, WORLD_SIZE);
      p.y = clamp(p.y + p.vy * dt, 0, WORLD_SIZE);
      p.vx *= 0.93;
      p.vy *= 0.93;

      for (const bot of state.bots) {
        if (Math.hypot(bot.x - p.x, bot.y - p.y) < radiusFromMass(bot.mass)) {
          bot.mass += p.mass;
          state.pellets.splice(i, 1);
          i--;
          break;
        }
      }
      if (i < 0 || !state.pellets[i]) continue;

      for (const cell of state.playerCells) {
        if (Math.hypot(cell.x - p.x, cell.y - p.y) < radiusFromMass(cell.mass)) {
          cell.mass += p.mass;
          state.pellets.splice(i, 1);
          i--;
          break;
        }
      }

      if (i >= 0 && state.pellets[i] && p.life <= 0) state.pellets.splice(i, 1);
    }
  }

  function eatCells() {
    const entities = [
      ...state.playerCells.map((c) => ({ ...c, owner: "player", ref: c })),
      ...state.bots.map((b) => ({ ...b, owner: "bot", ref: b })),
    ];

    for (let i = 0; i < entities.length; i++) {
      for (let j = entities.length - 1; j >= 0; j--) {
        if (i === j) continue;
        const eater = entities[i];
        const target = entities[j];
        if (eater.owner === target.owner && eater.owner === "player") continue;
        if (eater.ref.mass <= target.ref.mass * 1.08) continue;

        const dist = Math.hypot(eater.ref.x - target.ref.x, eater.ref.y - target.ref.y);
        if (dist < radiusFromMass(eater.ref.mass) * 0.72) {
          eater.ref.mass += target.ref.mass * 0.82;
          emitParticles(target.ref.x, target.ref.y, target.ref.color, 20);

          if (target.owner === "player") {
            const idxPlayer = state.playerCells.indexOf(target.ref);
            if (idxPlayer >= 0) state.playerCells.splice(idxPlayer, 1);
            if (state.playerCells.length === 0) {
              addEvent("Tu as été absorbé... relance immédiate.");
              initWorld();
              return;
            }
          } else {
            const idxBot = state.bots.indexOf(target.ref);
            if (idxBot >= 0) state.bots.splice(idxBot, 1);
            state.bots.push(makeBot(Math.floor(random(100, 2000))));
            if (eater.owner === "player") {
              const xp = Math.round(target.ref.mass * 0.7);
              gainXp(xp, `Bot ${target.ref.name} absorbé (+${xp} XP)`);
            }
          }
        }
      }
    }
  }

  function emitParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      state.particles.push({ x, y, vx: random(-180, 180), vy: random(-180, 180), life: random(0.25, 0.7), color, size: random(2, 5) });
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  function worldToScreen(camera, x, y) {
    return { x: (x - camera.x) * camera.zoom + window.innerWidth / 2, y: (y - camera.y) * camera.zoom + window.innerHeight / 2 };
  }

  function drawBackground(camera) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = "#030a18";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    const spacing = 95 * camera.zoom;
    ctx.strokeStyle = "rgba(80, 125, 180, 0.14)";
    ctx.lineWidth = 1;

    const startX = (-camera.x * camera.zoom + window.innerWidth / 2) % spacing;
    const startY = (-camera.y * camera.zoom + window.innerHeight / 2) % spacing;

    for (let x = startX; x < window.innerWidth; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, window.innerHeight);
      ctx.stroke();
    }
    for (let y = startY; y < window.innerHeight; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(window.innerWidth, y);
      ctx.stroke();
    }
  }

  function drawCircle(camera, entity, glow = false) {
    const pos = worldToScreen(camera, entity.x, entity.y);
    const radius = radiusFromMass(entity.mass) * camera.zoom;

    if (glow) {
      ctx.shadowColor = entity.color;
      ctx.shadowBlur = 26;
    }

    ctx.fillStyle = entity.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(255,255,255,0.24)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (radius > 14 && entity.name) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.font = `${clamp(radius * 0.42, 11, 24)}px Inter`;
      ctx.textAlign = "center";
      ctx.fillText(entity.name, pos.x, pos.y + 4);
    }
  }

  function render() {
    const totalMass = getPlayerMass();
    const center = playerCenter();
    const zoom = clamp(1.22 - Math.sqrt(totalMass) * 0.012, 0.34, 1.12);
    const camera = { x: center.x, y: center.y, zoom };

    drawBackground(camera);

    for (const food of state.foods) {
      const pos = worldToScreen(camera, food.x, food.y);
      const size = clamp(2.8 * zoom + food.mass, 1.8, 5.7);
      if (pos.x < -10 || pos.y < -10 || pos.x > window.innerWidth + 10 || pos.y > window.innerHeight + 10) continue;
      ctx.fillStyle = food.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const pellet of state.pellets) {
      const pos = worldToScreen(camera, pellet.x, pellet.y);
      ctx.fillStyle = pellet.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, clamp(radiusFromMass(pellet.mass) * camera.zoom * 0.6, 2, 8), 0, Math.PI * 2);
      ctx.fill();
    }

    for (const bot of state.bots) drawCircle(camera, bot, false);

    for (const cell of state.playerCells) drawCircle(camera, { ...cell, name: state.playerCells.length > 1 ? "Toi" : "Toi" }, true);

    for (const p of state.particles) {
      const pos = worldToScreen(camera, p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life * 1.6);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.size * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawBoostGauge();
  }

  function drawBoostGauge() {
    const w = 200;
    const h = 14;
    const x = window.innerWidth - w - 24;
    const y = window.innerHeight - 28;

    ctx.fillStyle = "rgba(6, 15, 34, 0.78)";
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = "#3fe3b2";
    ctx.fillRect(x, y, w * player.boostEnergy, h);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = "rgba(245, 252, 255, 0.92)";
    ctx.font = "12px Inter";
    ctx.fillText("Boost Shift / Split E / Masse A", x - 4, y - 6);
  }

  function updateLeaderboard() {
    const entries = [
      { name: player.name, mass: getPlayerMass(), isPlayer: true },
      ...state.bots.map((b) => ({ name: b.name, mass: b.mass, isPlayer: false })),
    ]
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 10);

    ui.leaderboard.innerHTML = "";
    entries.forEach((entry, idx) => {
      const li = document.createElement("li");
      li.textContent = `#${idx + 1} ${entry.name} · ${Math.round(entry.mass)} masse`;
      li.style.color = entry.isPlayer ? "#7eff8d" : "#eff7ff";
      ui.leaderboard.appendChild(li);
    });

    const masses = [getPlayerMass(), ...state.bots.map((b) => b.mass)].sort((a, b) => b - a);
    ui.rank.textContent = `#${1 + masses.findIndex((m) => m === getPlayerMass())}`;
  }

  function updateHud() {
    const totalMass = getPlayerMass();
    ui.level.textContent = String(state.level);
    ui.xp.textContent = `${Math.floor(state.xp)} / ${state.xpToNext}`;
    ui.mass.textContent = `${Math.round(totalMass)} (${state.playerCells.length} cellule${state.playerCells.length > 1 ? "s" : ""})`;
    ui.xpFill.style.width = `${(state.xp / state.xpToNext) * 100}%`;

    ui.eventLog.innerHTML = "";
    state.events.forEach((event) => {
      const li = document.createElement("li");
      li.textContent = event;
      ui.eventLog.appendChild(li);
    });

    updateLeaderboard();
  }

  function ensureBotPopulation() {
    while (state.bots.length < state.botTargetCount) state.bots.push(makeBot(Math.floor(random(100, 3000))));
    if (state.bots.length > state.botTargetCount) state.bots.length = state.botTargetCount;
  }

  function tick(timestamp) {
    if (!state.running) return;
    const rawDt = clamp((timestamp - state.lastTime) / 1000, 0.001, 0.035);
    const dt = rawDt * state.gameSpeed;
    state.lastTime = timestamp;
    state.clock += rawDt;

    movePlayer(dt);
    state.playerCells.forEach((cell) => consumeFood(cell, dt, 1));

    state.bots.forEach((bot) => {
      updateBotBehavior(bot, dt);
      consumeFood(bot, dt, 0.94);
    });

    updatePellets(dt);
    eatCells();
    ensureBotPopulation();
    updateParticles(dt);

    if (state.clock % 0.1 < rawDt) updateHud();
    render();

    requestAnimationFrame(tick);
  }

  function startGame() {
    const count = parseInt(ui.botCountInput?.value || DEFAULT_BOT_COUNT, 10);
    state.botTargetCount = clamp(Number.isFinite(count) ? count : DEFAULT_BOT_COUNT, 5, 120);
    const diff = parseFloat(ui.difficultySelect?.value || "1");
    state.difficulty = clamp(Number.isFinite(diff) ? diff : 1, 0.85, 2);
    state.gameSpeed = BASE_GAME_SPEED + (state.difficulty - 1) * 0.35;

    initWorld();
    state.running = true;
    ui.overlay.classList.remove("visible");
    state.lastTime = performance.now();
    updateHud();
    requestAnimationFrame(tick);
    addEvent(`Partie lancée: ${state.botTargetCount} bots, difficulté x${state.difficulty.toFixed(2)}.`);
  }

  ui.startBtn.addEventListener("click", startGame);
  window.addEventListener("resize", resize);
  resize();
  render();
})();
