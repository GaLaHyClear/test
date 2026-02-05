(() => {
  const WORLD_SIZE = 5600;
  const INITIAL_PLAYER_MASS = 16;
  const BOT_COUNT = 28;
  const FOOD_COUNT = 900;
  const BOT_NAMES = [
    "Nova",
    "Kraken",
    "Pixel",
    "Nébuleuse",
    "Turbo",
    "Yuzu",
    "Éclair",
    "Vortex",
    "Basilic",
    "Cerbère",
    "Saphir",
    "Panthère",
  ];

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
  };

  const state = {
    running: false,
    keys: { z: false, q: false, s: false, d: false, shift: false },
    foods: [],
    bots: [],
    particles: [],
    events: [],
    xp: 0,
    level: 1,
    xpToNext: 60,
    clock: 0,
    lastTime: 0,
  };

  const player = {
    name: "Toi",
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    vx: 0,
    vy: 0,
    mass: INITIAL_PLAYER_MASS,
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
    return Math.sqrt(mass) * 4.6;
  }

  function speedFromMass(mass) {
    return clamp(210 / Math.sqrt(mass), 24, 170);
  }

  function randomColor(hueBase = random(0, 360)) {
    const hue = (hueBase + random(-20, 20) + 360) % 360;
    return `hsl(${hue}, ${random(66, 92)}%, ${random(48, 66)}%)`;
  }

  function makeFood() {
    return {
      x: random(0, WORLD_SIZE),
      y: random(0, WORLD_SIZE),
      mass: random(0.8, 1.4),
      color: randomColor(),
    };
  }

  function makeBot(index) {
    const mass = random(11, 42);
    const seed = random(0, 360);
    return {
      id: `bot-${index}`,
      name: `${BOT_NAMES[index % BOT_NAMES.length]}-${index + 1}`,
      x: random(0, WORLD_SIZE),
      y: random(0, WORLD_SIZE),
      vx: random(-30, 30),
      vy: random(-30, 30),
      mass,
      color: randomColor(seed),
      behaviorTimer: random(0, 1.5),
      desiredX: random(0, WORLD_SIZE),
      desiredY: random(0, WORLD_SIZE),
      tone: seed,
    };
  }

  function initWorld() {
    state.foods = Array.from({ length: FOOD_COUNT }, () => makeFood());
    state.bots = Array.from({ length: BOT_COUNT }, (_, i) => makeBot(i));
    state.particles = [];
    state.events = ["Bienvenue dans l'arène !", "Objectif: survivre et dominer le top 10."];
    player.mass = INITIAL_PLAYER_MASS;
    player.x = WORLD_SIZE / 2;
    player.y = WORLD_SIZE / 2;
    player.vx = 0;
    player.vy = 0;
    player.boostEnergy = 1;
    state.xp = 0;
    state.level = 1;
    state.xpToNext = 60;
    state.clock = 0;
  }

  function addEvent(msg) {
    state.events.unshift(msg);
    state.events = state.events.slice(0, 7);
  }

  function gainXp(amount, reason) {
    state.xp += amount;
    while (state.xp >= state.xpToNext) {
      state.xp -= state.xpToNext;
      state.level += 1;
      state.xpToNext = Math.round(state.xpToNext * 1.24 + 18);
      player.mass += 2.2;
      addEvent(`Niveau ${state.level} atteint ! +2.2 masse bonus.`);
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

  function movePlayer(dt) {
    let dirX = 0;
    let dirY = 0;
    if (state.keys.z) dirY -= 1;
    if (state.keys.s) dirY += 1;
    if (state.keys.q) dirX -= 1;
    if (state.keys.d) dirX += 1;

    const length = Math.hypot(dirX, dirY) || 1;
    dirX /= length;
    dirY /= length;

    const baseSpeed = speedFromMass(player.mass);
    let boostFactor = 1;
    if (state.keys.shift && player.boostEnergy > 0.05) {
      boostFactor = 1.75;
      player.boostEnergy = clamp(player.boostEnergy - dt * 0.38, 0, 1);
    } else {
      player.boostEnergy = clamp(player.boostEnergy + dt * 0.18, 0, 1);
    }

    const accel = baseSpeed * boostFactor * 4.8;
    player.vx += dirX * accel * dt;
    player.vy += dirY * accel * dt;

    player.vx *= 0.84;
    player.vy *= 0.84;
    player.x = clamp(player.x + player.vx * dt, 0, WORLD_SIZE);
    player.y = clamp(player.y + player.vy * dt, 0, WORLD_SIZE);
  }

  function updateBotBehavior(bot, dt) {
    bot.behaviorTimer -= dt;

    if (bot.behaviorTimer <= 0) {
      bot.behaviorTimer = random(0.35, 1.2);
      const nearestFood = nearestEntity(bot, state.foods);
      const threat = nearestThreat(bot);
      if (threat && threat.distance < radiusFromMass(bot.mass) * 8) {
        bot.desiredX = clamp(bot.x - (threat.x - bot.x) * 3, 0, WORLD_SIZE);
        bot.desiredY = clamp(bot.y - (threat.y - bot.y) * 3, 0, WORLD_SIZE);
      } else if (nearestFood) {
        bot.desiredX = nearestFood.x + random(-65, 65);
        bot.desiredY = nearestFood.y + random(-65, 65);
      } else {
        bot.desiredX = random(0, WORLD_SIZE);
        bot.desiredY = random(0, WORLD_SIZE);
      }
    }

    const dirX = bot.desiredX - bot.x;
    const dirY = bot.desiredY - bot.y;
    const len = Math.hypot(dirX, dirY) || 1;
    const speed = speedFromMass(bot.mass) * 0.8;

    bot.vx += (dirX / len) * speed * dt * 5;
    bot.vy += (dirY / len) * speed * dt * 5;
    bot.vx *= 0.88;
    bot.vy *= 0.88;
    bot.x = clamp(bot.x + bot.vx * dt, 0, WORLD_SIZE);
    bot.y = clamp(bot.y + bot.vy * dt, 0, WORLD_SIZE);
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
    for (const entity of [player, ...state.bots]) {
      if (entity === bot) continue;
      if (entity.mass <= bot.mass * 1.15) continue;
      const distance = Math.hypot(entity.x - bot.x, entity.y - bot.y);
      if (!best || distance < best.distance) {
        best = { x: entity.x, y: entity.y, distance };
      }
    }
    return best;
  }

  function consumeFood(entity, dt, gainFactor = 1) {
    const r = radiusFromMass(entity.mass);
    for (let i = state.foods.length - 1; i >= 0; i--) {
      const food = state.foods[i];
      const dist = Math.hypot(food.x - entity.x, food.y - entity.y);
      if (dist < r + 2) {
        entity.mass += food.mass * gainFactor;
        state.foods[i] = makeFood();
        if (entity === player) {
          gainXp(1.1, null);
          emitParticles(food.x, food.y, food.color, 3);
        }
      }
    }
    entity.mass = Math.max(8, entity.mass - dt * 0.035);
  }

  function eatCells() {
    const entities = [player, ...state.bots];
    for (let i = 0; i < entities.length; i++) {
      for (let j = entities.length - 1; j >= 0; j--) {
        if (i === j) continue;
        const eater = entities[i];
        const target = entities[j];
        if (eater.mass <= target.mass * 1.08) continue;
        const dist = Math.hypot(eater.x - target.x, eater.y - target.y);
        const eaterR = radiusFromMass(eater.mass);
        if (dist < eaterR * 0.72) {
          eater.mass += target.mass * 0.82;
          emitParticles(target.x, target.y, target.color, 22);
          if (target === player) {
            addEvent("Tu as été absorbé... nouvelle tentative !");
            initWorld();
            return;
          }
          if (eater === player) {
            gainXp(Math.round(target.mass * 0.6), `Bot ${target.name} absorbé (+${Math.round(target.mass * 0.6)} XP)`);
          }
          if (target !== player) {
            const idx = state.bots.indexOf(target);
            if (idx >= 0) state.bots.splice(idx, 1);
            state.bots.push(makeBot(Math.floor(random(200, 999))));
          }
        }
      }
    }
  }

  function emitParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      state.particles.push({
        x,
        y,
        vx: random(-140, 140),
        vy: random(-140, 140),
        life: random(0.35, 0.75),
        color,
        size: random(2, 5),
      });
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  function worldToScreen(camera, x, y) {
    return {
      x: (x - camera.x) * camera.zoom + window.innerWidth / 2,
      y: (y - camera.y) * camera.zoom + window.innerHeight / 2,
    };
  }

  function drawBackground(camera) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = "#030a18";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    const spacing = 120 * camera.zoom;
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
      ctx.shadowBlur = 24;
    }

    ctx.fillStyle = entity.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(255,255,255,0.24)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (radius > 16) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.font = `${clamp(radius * 0.45, 12, 24)}px Inter`;
      ctx.textAlign = "center";
      ctx.fillText(entity.name, pos.x, pos.y + 4);
    }
  }

  function render() {
    const zoom = clamp(1.12 - Math.sqrt(player.mass) * 0.012, 0.4, 1.1);
    const camera = { x: player.x, y: player.y, zoom };

    drawBackground(camera);

    for (const food of state.foods) {
      const pos = worldToScreen(camera, food.x, food.y);
      const size = clamp(2.8 * zoom + food.mass, 1.8, 5.5);
      if (pos.x < -10 || pos.y < -10 || pos.x > window.innerWidth + 10 || pos.y > window.innerHeight + 10) continue;
      ctx.fillStyle = food.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const bot of state.bots) {
      drawCircle(camera, bot, false);
    }

    drawCircle(camera, player, true);

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
    const w = 180;
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
    ctx.fillText("Énergie boost (Shift)", x, y - 6);
  }

  function updateLeaderboard() {
    const entries = [{ name: player.name, mass: player.mass, isPlayer: true }, ...state.bots.map((b) => ({ name: b.name, mass: b.mass }))]
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 10);

    ui.leaderboard.innerHTML = "";
    entries.forEach((entry, idx) => {
      const li = document.createElement("li");
      li.textContent = `#${idx + 1} ${entry.name} · ${Math.round(entry.mass)} masse`;
      li.style.color = entry.isPlayer ? "#7eff8d" : "#eff7ff";
      ui.leaderboard.appendChild(li);
    });

    const rank =
      1 +
      [player, ...state.bots]
        .map((entity) => entity.mass)
        .sort((a, b) => b - a)
        .findIndex((mass) => mass === player.mass);

    ui.rank.textContent = `#${rank}`;
  }

  function updateHud() {
    ui.level.textContent = String(state.level);
    ui.xp.textContent = `${Math.floor(state.xp)} / ${state.xpToNext}`;
    ui.mass.textContent = Math.round(player.mass);
    ui.xpFill.style.width = `${(state.xp / state.xpToNext) * 100}%`;

    ui.eventLog.innerHTML = "";
    state.events.forEach((event) => {
      const li = document.createElement("li");
      li.textContent = event;
      ui.eventLog.appendChild(li);
    });

    updateLeaderboard();
  }

  function tick(timestamp) {
    if (!state.running) return;
    const dt = clamp((timestamp - state.lastTime) / 1000, 0.001, 0.034);
    state.lastTime = timestamp;
    state.clock += dt;

    movePlayer(dt);
    consumeFood(player, dt, 1);
    state.bots.forEach((bot) => {
      updateBotBehavior(bot, dt);
      consumeFood(bot, dt, 0.86);
    });

    eatCells();
    updateParticles(dt);

    if (state.clock % 0.12 < dt) updateHud();
    render();

    requestAnimationFrame(tick);
  }

  function startGame() {
    initWorld();
    state.running = true;
    ui.overlay.classList.remove("visible");
    state.lastTime = performance.now();
    updateHud();
    requestAnimationFrame(tick);
    addEvent("Bonne chance ! Utilise Shift avec parcimonie.");
  }

  ui.startBtn.addEventListener("click", startGame);
  window.addEventListener("resize", resize);
  resize();
  render();
})();
