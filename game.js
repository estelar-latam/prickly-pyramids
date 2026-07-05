(function () {
  'use strict';

  const CONFIG = {
    rows: 7,
    blockSize: 52,
    flipDuration: 500,
    fallSpeed: 280,
    respawnDelay: 1200,
    invincibleTime: 1800,
    maxLives: 3,
    players: [
      {
        id: 1,
        name: 'Jugador 1',
        color: '#ff4757',
        keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
      },
      {
        id: 2,
        name: 'Jugador 2',
        color: '#2ed573',
        keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
      },
      {
        id: 3,
        name: 'Jugador 3',
        color: '#ffa502',
        keys: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL' },
      },
      {
        id: 4,
        name: 'Jugador 4',
        color: '#5352ed',
        keys: { up: 'KeyT', down: 'KeyG', left: 'KeyF', right: 'KeyH' },
      },
    ],
  };

  const BLOCK = { SOLID: 0, PRICKLED: 1, FLIPPING: 2, GONE: 3 };

  const screens = {
    menu: document.getElementById('menu-screen'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen'),
  };

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const hudEl = document.getElementById('hud');
  const controlsPreview = document.getElementById('controls-preview');
  const resultTitle = document.getElementById('result-title');
  const resultMessage = document.getElementById('result-message');

  let selectedPlayerCount = 3;
  let grid = [];
  let players = [];
  let particles = [];
  let running = false;
  let lastTime = 0;
  let offsetX = 0;
  let offsetY = 0;
  let maxCols = 0;
  const keysDown = new Set();

  const keyLabels = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D',
    KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
    KeyT: 'T', KeyF: 'F', KeyG: 'G', KeyH: 'H',
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove('screen--active'));
    screens[name].classList.add('screen--active');
  }

  function buildControlsPreview() {
    controlsPreview.innerHTML = '';
    CONFIG.players.slice(0, selectedPlayerCount).forEach((p) => {
      const row = document.createElement('div');
      row.className = 'control-row';
      const k = p.keys;
      row.innerHTML =
        `<span class="dot" style="background:${p.color}"></span>` +
        `<span><strong>${p.name}</strong> — ` +
        `${keyLabels[k.up]} ${keyLabels[k.down]} ${keyLabels[k.left]} ${keyLabels[k.right]}</span>`;
      controlsPreview.appendChild(row);
    });
  }

  function isValidCell(row, col) {
    if (row < 0 || row >= CONFIG.rows || col < 0) return false;
    const width = 2 * row + 1;
    const startCol = Math.floor((maxCols - width) / 2);
    return col >= startCol && col < startCol + width;
  }

  function createGrid() {
    maxCols = 2 * (CONFIG.rows - 1) + 1;
    grid = [];
    for (let r = 0; r < CONFIG.rows; r++) {
      grid[r] = [];
      for (let c = 0; c < maxCols; c++) {
        if (isValidCell(r, c)) {
          grid[r][c] = { state: BLOCK.SOLID, flipProgress: 0, prickledBy: null };
        } else {
          grid[r][c] = null;
        }
      }
    }
  }

  function getSpawnPositions(count) {
    const bottom = CONFIG.rows - 1;
    const positions = [];
    const width = 2 * bottom + 1;
    const startCol = Math.floor((maxCols - width) / 2);
    const slots = [];
    for (let c = startCol; c < startCol + width; c++) slots.push({ row: bottom, col: c });
    const step = Math.max(1, Math.floor(slots.length / count));
    for (let i = 0; i < count; i++) {
      const idx = Math.min(i * step, slots.length - 1);
      positions.push(slots[idx]);
    }
    return positions;
  }

  function initPlayers(count) {
    const spawns = getSpawnPositions(count);
    players = CONFIG.players.slice(0, count).map((cfg, i) => ({
      ...cfg,
      row: spawns[i].row,
      col: spawns[i].col,
      lives: CONFIG.maxLives,
      alive: true,
      falling: false,
      fallY: 0,
      respawnAt: 0,
      invincibleUntil: 0,
      moveCooldown: 0,
      x: 0,
      y: 0,
    }));
  }

  function resizeCanvas() {
    const w = maxCols * CONFIG.blockSize;
    const h = CONFIG.rows * CONFIG.blockSize + 80;
    canvas.width = w;
    canvas.height = h;
    offsetX = CONFIG.blockSize / 2;
    offsetY = 40;
  }

  function cellToPixel(row, col) {
    return {
      x: offsetX + col * CONFIG.blockSize,
      y: offsetY + row * CONFIG.blockSize,
    };
  }

  function prickleBlock(row, col, player) {
    const block = grid[row][col];
    if (!block || block.state === BLOCK.GONE || block.state === BLOCK.FLIPPING) return;

    if (block.state === BLOCK.SOLID) {
      block.state = BLOCK.PRICKLED;
      block.prickledBy = player.id;
      spawnParticles(cellToPixel(row, col).x, cellToPixel(row, col).y, '#ffd93d', 6);
    } else if (block.state === BLOCK.PRICKLED) {
      block.state = BLOCK.FLIPPING;
      block.flipProgress = 0;
      spawnParticles(cellToPixel(row, col).x, cellToPixel(row, col).y, player.color, 10);
    }
  }

  function removeBlock(row, col) {
    const block = grid[row][col];
    if (!block) return;
    block.state = BLOCK.GONE;
    spawnParticles(cellToPixel(row, col).x, cellToPixel(row, col).y, '#ff6b35', 14);
    checkPlayersOnVoid();
  }

  function getPlayersAt(row, col) {
    return players.filter((p) => p.alive && !p.falling && p.row === row && p.col === col);
  }

  function tryMove(player, dRow, dCol) {
    if (!player.alive || player.falling || player.moveCooldown > 0) return;
    const nr = player.row + dRow;
    const nc = player.col + dCol;
    if (!isValidCell(nr, nc)) return;
    const block = grid[nr][nc];
    if (!block || block.state === BLOCK.GONE || block.state === BLOCK.FLIPPING) return;

    player.row = nr;
    player.col = nc;
    player.moveCooldown = 0.12;
    prickleBlock(nr, nc, player);
  }

  function checkPlayersOnVoid() {
    players.forEach((player) => {
      if (!player.alive || player.falling) return;
      const block = grid[player.row][player.col];
      if (!block || block.state === BLOCK.GONE) {
        startFall(player);
      }
    });
  }

  function startFall(player) {
    if (player.falling) return;
    if (performance.now() < player.invincibleUntil) return;

    player.falling = true;
    const pos = cellToPixel(player.row, player.col);
    player.fallY = pos.y;
    player.fallRow = player.row;
    player.fallCol = player.col;
  }

  function completeFall(player) {
    player.falling = false;
    player.lives -= 1;
    spawnParticles(
      cellToPixel(player.fallRow, player.fallCol).x,
      canvas.height - 20,
      player.color,
      20
    );

    if (player.lives <= 0) {
      player.alive = false;
      checkWin();
      return;
    }

    player.respawnAt = performance.now() + CONFIG.respawnDelay;
    player.alive = false;
  }

  function respawnPlayer(player, now) {
    const candidates = [];
    for (let r = CONFIG.rows - 1; r >= 0; r--) {
      for (let c = 0; c < maxCols; c++) {
        if (!isValidCell(r, c)) continue;
        const block = grid[r][c];
        if (block && block.state === BLOCK.SOLID) {
          candidates.push({ row: r, col: c });
        }
      }
      if (candidates.length > 0) break;
    }

    if (candidates.length === 0) return;

    const spot = candidates[Math.floor(Math.random() * candidates.length)];
    player.row = spot.row;
    player.col = spot.col;
    player.alive = true;
    player.falling = false;
    player.respawnAt = 0;
    player.invincibleUntil = now + CONFIG.invincibleTime;
    player.moveCooldown = 0.3;
  }

  function aliveCount() {
    return players.filter((p) => p.lives > 0).length;
  }

  function checkWin() {
    const survivors = players.filter((p) => p.lives > 0);
    if (survivors.length <= 1 && aliveCount() > 0) {
      running = false;
      const winner = survivors[0];
      setTimeout(() => {
        resultTitle.textContent = '¡Victoria!';
        resultMessage.textContent = winner
          ? `${winner.name} es el último en pie.`
          : 'Empate total.';
        showScreen('result');
      }, 800);
    } else if (survivors.length === 0) {
      running = false;
      setTimeout(() => {
        resultTitle.textContent = 'Empate';
        resultMessage.textContent = 'Todos cayeron al vacío.';
        showScreen('result');
      }, 800);
    }
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 200,
        vy: (Math.random() - 0.5) * 200 - 80,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function updateParticles(dt) {
    particles = particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
      return p.life > 0;
    });
  }

  function updateBlocks(dt) {
    for (let r = 0; r < CONFIG.rows; r++) {
      for (let c = 0; c < maxCols; c++) {
        const block = grid[r][c];
        if (!block || block.state !== BLOCK.FLIPPING) continue;
        block.flipProgress += dt / (CONFIG.flipDuration / 1000);
        if (block.flipProgress >= 1) {
          removeBlock(r, c);
        }
      }
    }
  }

  function updatePlayers(dt, now) {
    players.forEach((player) => {
      if (player.moveCooldown > 0) player.moveCooldown -= dt;

      if (!player.alive && player.lives > 0 && player.respawnAt > 0 && now >= player.respawnAt) {
        respawnPlayer(player, now);
      }

      if (player.falling) {
        player.fallY += CONFIG.fallSpeed * dt;
        if (player.fallY > canvas.height + 20) {
          completeFall(player);
        }
      }
    });
  }

  function handleInput() {
    if (!running) return;

    players.forEach((player) => {
      const k = player.keys;
      if (keysDown.has(k.up)) tryMove(player, -1, 0);
      else if (keysDown.has(k.down)) tryMove(player, 1, 0);
      else if (keysDown.has(k.left)) tryMove(player, 0, -1);
      else if (keysDown.has(k.right)) tryMove(player, 0, 1);
    });
  }

  function drawBackground() {
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, '#0d1525');
    grd.addColorStop(1, '#060a12');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(0, 212, 255, 0.03)';
    for (let i = 0; i < 20; i++) {
      const x = (i * 97) % canvas.width;
      const y = (i * 53) % canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawVoid() {
    const bottom = offsetY + CONFIG.rows * CONFIG.blockSize + 10;
    const grd = ctx.createLinearGradient(0, bottom - 30, 0, canvas.height);
    grd.addColorStop(0, 'rgba(255, 50, 80, 0.0)');
    grd.addColorStop(0.3, 'rgba(255, 50, 80, 0.15)');
    grd.addColorStop(1, 'rgba(255, 20, 60, 0.35)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, bottom - 30, canvas.width, canvas.height - bottom + 30);

    ctx.fillStyle = 'rgba(255, 80, 100, 0.5)';
    ctx.font = '600 13px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('— VACÍO —', canvas.width / 2, canvas.height - 18);
  }

  function drawBlock(row, col, block) {
    const { x, y } = cellToPixel(row, col);
    const size = CONFIG.blockSize - 6;
    const half = size / 2;

    if (block.state === BLOCK.GONE) return;

    let fill = '#1e2d4a';
    let stroke = '#2a3f66';
    let spike = false;

    if (block.state === BLOCK.PRICKLED) {
      fill = '#3d3520';
      stroke = '#ffd93d';
      spike = true;
    } else if (block.state === BLOCK.FLIPPING) {
      const t = block.flipProgress;
      fill = `rgba(255, 107, 53, ${1 - t})`;
      stroke = '#ff6b35';
      spike = true;
    }

    ctx.save();
    ctx.translate(x, y);

    if (block.state === BLOCK.FLIPPING) {
      const scale = 1 - block.flipProgress * 0.85;
      ctx.scale(scale, scale);
    }

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    roundRect(ctx, -half, -half, size, size, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, -half + 3, -half + 3, size - 10, size * 0.35, 4);
    ctx.fill();

    if (spike) {
      ctx.fillStyle = block.state === BLOCK.PRICKLED ? '#ffd93d' : '#ff6b35';
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (i === 0 && j === 0) continue;
          ctx.beginPath();
          ctx.moveTo(i * 10, j * 10 - 4);
          ctx.lineTo(i * 10 + 3, j * 10 + 2);
          ctx.lineTo(i * 10 - 3, j * 10 + 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawPlayer(player) {
    if (!player.alive && !player.falling) return;

    let x, y;
    if (player.falling) {
      x = cellToPixel(player.fallRow, player.fallCol).x;
      y = player.fallY;
    } else {
      const pos = cellToPixel(player.row, player.col);
      x = pos.x;
      y = pos.y;
    }

    const now = performance.now();
    const invincible = now < player.invincibleUntil;
    if (invincible && Math.floor(now / 100) % 2 === 0) return;

    const radius = CONFIG.blockSize * 0.28;

    ctx.save();
    ctx.translate(x, y - 4);

    ctx.shadowColor = player.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(2, 2, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-radius * 0.3, -radius * 0.15, radius * 0.22, 0, Math.PI * 2);
    ctx.arc(radius * 0.3, -radius * 0.15, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(-radius * 0.3, -radius * 0.12, radius * 0.1, 0, Math.PI * 2);
    ctx.arc(radius * 0.3, -radius * 0.12, radius * 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawParticles() {
    particles.forEach((p) => {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function render() {
    drawBackground();
    drawVoid();

    for (let r = 0; r < CONFIG.rows; r++) {
      for (let c = 0; c < maxCols; c++) {
        const block = grid[r][c];
        if (block) drawBlock(r, c, block);
      }
    }

    players.forEach(drawPlayer);
    drawParticles();
  }

  function updateHud() {
    hudEl.innerHTML = '';
    players.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'hud-player' + (p.lives <= 0 ? ' hud-player--out' : '');
      el.style.color = p.color;
      let livesHtml = '';
      for (let i = 0; i < CONFIG.maxLives; i++) {
        livesHtml += `<span class="life${i < p.lives ? '' : ' life--lost'}"></span>`;
      }
      el.innerHTML = `<span>${p.name}</span><span class="lives">${livesHtml}</span>`;
      hudEl.appendChild(el);
    });
  }

  function gameLoop(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    handleInput();
    updateBlocks(dt);
    updatePlayers(dt, now);
    updateParticles(dt);
    updateHud();
    render();

    requestAnimationFrame(gameLoop);
  }

  function startGame() {
    createGrid();
    initPlayers(selectedPlayerCount);
    particles = [];
    resizeCanvas();
    updateHud();
    render();
    running = true;
    lastTime = performance.now();
    showScreen('game');
    requestAnimationFrame(gameLoop);
  }

  document.querySelectorAll('[data-players]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-players]').forEach((b) => b.classList.remove('btn--selected'));
      btn.classList.add('btn--selected');
      selectedPlayerCount = parseInt(btn.dataset.players, 10);
      buildControlsPreview();
    });
  });

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', () => showScreen('menu'));

  window.addEventListener('keydown', (e) => {
    keysDown.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    keysDown.delete(e.code);
  });

  buildControlsPreview();
})();