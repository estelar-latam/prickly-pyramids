(function () {
  'use strict';

  const CONFIG = {
    rows: 7,
    cols: 13,
    blockSize: 46,
    maxLives: 3,
    turnTime: 24,
    gravity: 420,
    players: [
      { id: 1, name: 'Jugador 1', color: '#f97316', keys: { left: 'ArrowLeft', right: 'ArrowRight', action: 'Space' } },
      { id: 2, name: 'Jugador 2', color: '#22c55e', keys: { left: 'KeyA', right: 'KeyD', action: 'KeyF' } },
      { id: 3, name: 'Jugador 3', color: '#3b82f6', keys: { left: 'KeyJ', right: 'KeyL', action: 'KeyK' } },
      { id: 4, name: 'Jugador 4', color: '#a855f7', keys: { left: 'KeyU', right: 'KeyO', action: 'KeyI' } }
    ],
    pieceTypes: ['I', 'T', 'L', 'O', 'S']
  };

  const screens = {
    menu: document.getElementById('menu-screen'),
    loading: document.getElementById('loading-screen'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen')
  };

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const hudEl = document.getElementById('hud');
  const timerEl = document.getElementById('timer');
  const currentTurnEl = document.getElementById('current-turn');
  const currentPieceEl = document.getElementById('current-piece');

  let grid = [];
  let players = [];
  let particles = [];
  let fallingBlocks = [];
  let running = false;
  let currentPlayerIndex = 0;
  let turnTimeLeft = CONFIG.turnTime;
  let turnTimer = null;
  let armAngle = -0.58;
  let armDirection = 1;
  let currentPieceType = 'T';
  let screenShake = 0;

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function getCurrentPlayer() { return players[currentPlayerIndex]; }

  function createGrid() {
    grid = [];
    for (let r = 0; r < CONFIG.rows; r++) {
      grid[r] = [];
      for (let c = 0; c < CONFIG.cols; c++) {
        const w = 2 * r + 1;
        const start = Math.floor((CONFIG.cols - w) / 2);
        grid[r][c] = (c >= start && c < start + w) ? { state: 'solid', height: 0 } : null;
      }
    }
  }

  function initPlayers(count) {
    players = CONFIG.players.slice(0, count).map((cfg, i) => {
      const bottom = CONFIG.rows - 1;
      const w = 2 * bottom + 1;
      const start = Math.floor((CONFIG.cols - w) / 2);
      return {
        ...cfg,
        row: bottom,
        col: start + Math.floor(w / (count + 1)) * (i + 1),
        lives: CONFIG.maxLives,
        alive: true
      };
    });
  }

  // ==================== FÍSICA DE BLOQUES EN CAÍDA ====================
  function applyGravityAndCollapse() {
    let fell = false;

    for (let r = CONFIG.rows - 2; r >= 0; r--) {
      for (let c = 0; c < CONFIG.cols; c++) {
        const block = grid[r][c];
        if (!block || block.state !== 'solid') continue;

        const below = grid[r + 1][c];
        if (!below || below.state !== 'solid') {
          fallingBlocks.push({
            x: 55 + c * CONFIG.blockSize,
            y: 148 + r * 43,
            vy: 85 + Math.random() * 55,
            life: 1.15,
            color: '#854d0e'
          });
          grid[r][c] = null;
          fell = true;
        }
      }
    }

    if (fell) {
      screenShake = Math.max(screenShake, 11);
      // Pequeña probabilidad de cadena de colapsos
      if (Math.random() < 0.35) {
        setTimeout(() => {
          if (running) applyGravityAndCollapse();
        }, 180);
      }
    }
  }

  function updateFallingBlocks(dt) {
    fallingBlocks = fallingBlocks.filter(b => {
      b.y += b.vy * dt;
      b.vy += CONFIG.gravity * dt;
      b.life -= dt;

      if (b.y > canvas.height - 65 || b.life <= 0) {
        spawnParticles(b.x + 20, b.y + 14, b.color, 8);
        return false;
      }
      return true;
    });
  }

  function checkPlayerFall() {
    players.forEach(p => {
      if (!p.alive) return;
      const block = grid[p.row][p.col];
      if (!block || block.state !== 'solid') {
        p.lives--;
        spawnParticles(55 + p.col * CONFIG.blockSize + 23, 148 + p.row * 43 + 16, p.color, 13);

        if (p.lives <= 0) {
          p.alive = false;
          checkWin();
        } else {
          for (let r = CONFIG.rows - 1; r >= 0; r--) {
            for (let c = 0; c < CONFIG.cols; c++) {
              if (grid[r][c]) {
                p.row = r;
                p.col = c;
                return;
              }
            }
          }
        }
      }
    });
  }

  function checkWin() {
    const alive = players.filter(p => p.alive);
    if (alive.length <= 1 && running) {
      running = false;
      if (turnTimer) clearInterval(turnTimer);
      setTimeout(() => {
        showScreen('result');
        const w = alive[0];
        document.getElementById('result-title').textContent = w ? '¡Victoria!' : 'Colapso total';
        document.getElementById('result-message').innerHTML = w 
          ? `<strong style="color:${w.color}">${w.name}</strong> sobrevivió al vacío.` 
          : 'Todos cayeron al vacío.';
      }, 850);
    }
  }

  function updateArm() {
    if (!running) return;
    armAngle += armDirection * 0.027;
    if (armAngle > 0.82) armDirection = -1;
    if (armAngle < -0.82) armDirection = 1;
  }

  function dropPiece() {
    if (!running) return;
    const player = getCurrentPlayer();
    if (!player.alive) return;

    const dropX = 142 + Math.sin(armAngle) * 205;
    const col = Math.max(0, Math.min(CONFIG.cols - 1, Math.floor((dropX - 55) / CONFIG.blockSize)));

    for (let r = CONFIG.rows - 1; r >= 0; r--) {
      if (grid[r][col] && grid[r][col].state === 'solid') {
        grid[r][col].height = (grid[r][col].height || 0) + 1;

        spawnParticles(dropX, 148 + r * 43 + 10, player.color, 10);
        screenShake = Math.max(screenShake, 8);

        // Impacto puede desestabilizar bloques cercanos
        if (Math.random() < 0.32) {
          const left = grid[r][col - 1];
          const right = grid[r][col + 1];
          if (left && left.state === 'solid' && Math.random() < 0.6) left.height = (left.height || 0) + 1;
          if (right && right.state === 'solid' && Math.random() < 0.6) right.height = (right.height || 0) + 1;
        }

        setTimeout(() => {
          if (running) {
            applyGravityAndCollapse();
            checkPlayerFall();
            updateHUD();
            nextTurn();
          }
        }, 380);
        return;
      }
    }
  }

  function nextTurn() {
    if (!running) return;
    let next = (currentPlayerIndex + 1) % players.length;
    let tries = 0;
    while (!players[next].alive && tries < players.length) {
      next = (next + 1) % players.length;
      tries++;
    }
    if (tries >= players.length) return checkWin();

    currentPlayerIndex = next;
    turnTimeLeft = CONFIG.turnTime;
    currentPieceType = CONFIG.pieceTypes[Math.floor(Math.random() * 5)];
    armAngle = -0.58;
    armDirection = 1;

    updateHUD();
    updateTurnUI();
    updatePieceUI();
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 130 - 30,
        life: 0.52 + Math.random() * 0.38,
        color,
        size: 3.2 + Math.random() * 3
      });
    }
  }

  function updateParticles(dt) {
    particles = particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 360 * dt;
      return p.life > 0;
    });
  }

  function draw() {
    ctx.save();
    if (screenShake > 0) {
      ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
      screenShake *= 0.82;
      if (screenShake < 0.5) screenShake = 0;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fondo oscuro
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#0f172a');
    g.addColorStop(0.4, '#1e2937');
    g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pirámide
    const bs = CONFIG.blockSize;
    for (let r = 0; r < CONFIG.rows; r++) {
      const w = 2 * r + 1;
      const start = Math.floor((CONFIG.cols - w) / 2);
      for (let c = start; c < start + w; c++) {
        const b = grid[r][c];
        if (!b) continue;
        const x = 55 + c * bs;
        const y = 148 + r * 43;

        ctx.fillStyle = b.height > 0 ? '#b45309' : '#854d0e';
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, bs - 2, bs - 2);
        ctx.strokeRect(x, y, bs - 2, bs - 2);

        if (b.height > 0) {
          ctx.fillStyle = '#fcd34d';
          ctx.fillRect(x + 5, y + 5, bs - 12, 4);
        }
      }
    }

    // Brazo
    ctx.save();
    ctx.translate(142, 155);
    ctx.rotate(armAngle);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 205);
    ctx.stroke();

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 5.5;
    for (let i = 1; i < 5; i++) {
      const yy = (205 / 5) * i;
      ctx.beginPath();
      ctx.moveTo(-4, yy);
      ctx.lineTo(4, yy);
      ctx.stroke();
    }

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-15, 200);
    ctx.lineTo(0, 228);
    ctx.lineTo(15, 200);
    ctx.stroke();

    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, 231, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Jugadores
    players.forEach(p => {
      if (!p.alive) return;
      const x = 55 + p.col * bs + 23;
      const y = 148 + p.row * 43 - 5;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Bloques cayendo
    fallingBlocks.forEach(b => {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, 35, 31);
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x, b.y, 35, 31);
    });

    // Partículas
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  let lastTime = performance.now();

  function gameLoop(now = performance.now()) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    updateArm();
    updateFallingBlocks(dt);
    updateParticles(dt * 0.9);
    draw();
    requestAnimationFrame(gameLoop);
  }

  function updateHUD() {
    hudEl.innerHTML = '';
    players.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = `hud-player ${!p.alive ? 'out' : ''}`;
      let hearts = '';
      for (let j = 0; j < CONFIG.maxLives; j++) hearts += `<div class="life ${j >= p.lives ? 'lost' : ''}"></div>`;
      div.innerHTML = `<span class="dot" style="background:${p.color}"></span> <strong>${p.name}</strong> <div class="lives">${hearts}</div>`;
      if (i === currentPlayerIndex && p.alive) div.style.boxShadow = `0 0 0 3px ${p.color}`;
      hudEl.appendChild(div);
    });
  }

  function updateTurnUI() {
    const p = getCurrentPlayer();
    if (currentTurnEl) currentTurnEl.innerHTML = `<span style="color:${p.color}">●</span> Turno de <strong>${p.name}</strong>`;
  }

  function updatePieceUI() {
    if (currentPieceEl) currentPieceEl.innerHTML = `<span style="font-size:2.2rem; font-weight:900; color:#fbbf24;">${currentPieceType}</span>`;
  }

  function startTurnTimer() {
    if (turnTimer) clearInterval(turnTimer);
    turnTimer = setInterval(() => {
      if (!running) return;
      turnTimeLeft--;
      if (timerEl) timerEl.textContent = turnTimeLeft;
      if (turnTimeLeft <= 0) { clearInterval(turnTimer); nextTurn(); }
    }, 1000);
  }

  function startCountdown() {
    let c = 3;
    const iv = setInterval(() => {
      ctx.fillStyle = 'rgba(15,23,42,0.9)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 125px Orbitron';
      ctx.textAlign = 'center';

      if (c > 0) ctx.fillText(c, canvas.width/2, canvas.height/2 + 42);
      else {
        clearInterval(iv);
        ctx.fillText('START', canvas.width/2, canvas.height/2 + 42);
        setTimeout(() => { startTurnTimer(); gameLoop(); }, 600);
      }
      c--;
    }, 760);
  }

  function startGame() {
    createGrid();
    initPlayers(3);
    particles = [];
    fallingBlocks = [];
    currentPlayerIndex = 0;
    turnTimeLeft = CONFIG.turnTime;
    armAngle = -0.58;
    currentPieceType = 'T';
    screenShake = 0;
    running = false;

    showScreen('loading');

    setTimeout(() => {
      showScreen('game');
      updateHUD();
      updateTurnUI();
      updatePieceUI();
      if (timerEl) timerEl.textContent = turnTimeLeft;
      startCountdown();
      running = true;
    }, 1300);
  }

  function restartGame() {
    if (turnTimer) clearInterval(turnTimer);
    showScreen('menu');
    running = false;
  }

  document.querySelectorAll('.player-selector button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-selector button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  window.addEventListener('keydown', e => {
    if (!running) return;
    const p = getCurrentPlayer();
    if (!p || !p.alive) return;

    if (e.code === p.keys.left) armAngle -= 0.12;
    if (e.code === p.keys.right) armAngle += 0.12;
    if (e.code === p.keys.action || e.code === 'Space') {
      e.preventDefault();
      dropPiece();
    }
  });

  function init() {
    canvas.width = 860;
    canvas.height = 620;
    showScreen('menu');
    console.log('%c[Prickly Pyramids] Enfoque en Bloques en Caída - Repositorio reconstruido.', 'color:#fbbf24');
  }

  init();
})();