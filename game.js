(function () {
  'use strict';

  // ==================== CONFIGURACIÓN ====================
  const CONFIG = {
    rows: 7,
    cols: 13,
    blockSize: 46,
    maxLives: 3,
    turnTime: 25,
    gravity: 380,
    players: [
      { id: 1, name: 'Jugador 1', color: '#f97316', keys: { left: 'ArrowLeft', right: 'ArrowRight', action: 'Space' } },
      { id: 2, name: 'Jugador 2', color: '#22c55e', keys: { left: 'KeyA', right: 'KeyD', action: 'KeyF' } },
      { id: 3, name: 'Jugador 3', color: '#3b82f6', keys: { left: 'KeyJ', right: 'KeyL', action: 'KeyK' } },
      { id: 4, name: 'Jugador 4', color: '#a855f7', keys: { left: 'KeyU', right: 'KeyO', action: 'KeyI' } },
    ],
    pieceTypes: ['I', 'T', 'L', 'O', 'S']
  };

  // ==================== VARIABLES GLOBALES ====================
  const screens = {
    menu: document.getElementById('menu-screen'),
    loading: document.getElementById('loading-screen'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen'),
  };

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d', { alpha: true });

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
  let armAngle = -0.6;
  let armDirection = 1;
  let currentPieceType = 'T';
  let screenShake = 0;

  // ==================== UTILIDADES ====================
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (screens[name]) screens[name].classList.add('active');
  }

  function getCurrentPlayer() {
    return players[currentPlayerIndex];
  }

  // ==================== INICIALIZACIÓN ====================
  function createGrid() {
    grid = [];
    for (let r = 0; r < CONFIG.rows; r++) {
      grid[r] = [];
      for (let c = 0; c < CONFIG.cols; c++) {
        const width = 2 * r + 1;
        const startCol = Math.floor((CONFIG.cols - width) / 2);
        grid[r][c] = (c >= startCol && c < startCol + width)
          ? { state: 'solid', height: 0, placedBy: null }
          : null;
      }
    }
  }

  function initPlayers(count) {
    players = CONFIG.players.slice(0, count).map((cfg, i) => {
      const bottom = CONFIG.rows - 1;
      const width = 2 * bottom + 1;
      const startCol = Math.floor((CONFIG.cols - width) / 2);
      const spawnCol = startCol + Math.floor(width / (count + 1)) * (i + 1);
      return {
        ...cfg,
        row: bottom,
        col: spawnCol,
        lives: CONFIG.maxLives,
        alive: true,
        score: 0
      };
    });
  }

  // ==================== FÍSICA ====================
  function applyGravity() {
    let changed = false;
    for (let r = CONFIG.rows - 2; r >= 0; r--) {
      for (let c = 0; c < CONFIG.cols; c++) {
        const block = grid[r][c];
        if (!block || block.state !== 'solid') continue;

        const below = grid[r + 1][c];
        if (!below || below.state !== 'solid') {
          fallingBlocks.push({
            x: 55 + c * CONFIG.blockSize,
            y: 148 + r * 43,
            vy: 70 + Math.random() * 40,
            life: 1.1,
            color: block.height > 0 ? '#ec4899' : '#854d0e'
          });
          grid[r][c] = null;
          changed = true;
        }
      }
    }
    if (changed) screenShake = Math.max(screenShake, 10);
  }

  function updateFallingBlocks(dt) {
    fallingBlocks = fallingBlocks.filter(b => {
      b.y += b.vy * dt;
      b.vy += CONFIG.gravity * dt;
      b.life -= dt;

      if (b.y > canvas.height - 70 || b.life <= 0) {
        spawnParticles(b.x + 20, b.y + 15, b.color, 7);
        return false;
      }
      return true;
    });
  }

  function checkPlayersFall() {
    players.forEach(player => {
      if (!player.alive) return;
      const blockBelow = grid[player.row][player.col];
      if (!blockBelow || blockBelow.state !== 'solid') {
        player.lives--;
        spawnParticles(
          55 + player.col * CONFIG.blockSize + 23,
          148 + player.row * 43 + 18,
          player.color,
          14
        );

        if (player.lives <= 0) {
          player.alive = false;
        } else {
          // Buscar nuevo soporte
          for (let r = CONFIG.rows - 1; r >= 0; r--) {
            for (let c = 0; c < CONFIG.cols; c++) {
              if (grid[r][c]) {
                player.row = r;
                player.col = c;
                return;
              }
            }
          }
        }
      }
    });
  }

  function checkWinCondition() {
    const alivePlayers = players.filter(p => p.alive);
    if (alivePlayers.length <= 1 && running) {
      running = false;
      if (turnTimer) clearInterval(turnTimer);

      setTimeout(() => {
        showScreen('result');
        const winner = alivePlayers[0];
        if (winner) {
          document.getElementById('result-title').textContent = '¡Victoria!';
          document.getElementById('result-message').innerHTML =
            `<strong style="color:${winner.color}">${winner.name}</strong> es el último en pie.`;
        } else {
          document.getElementById('result-title').textContent = 'Empate';
          document.getElementById('result-message').textContent = 'Todos los jugadores cayeron.';
        }
      }, 900);
    }
  }

  // ==================== BRAZO Y PIEZAS ====================
  function updateArm() {
    if (!running) return;
    armAngle += armDirection * 0.028;
    if (armAngle > 0.82) armDirection = -1;
    if (armAngle < -0.82) armDirection = 1;
  }

  function dropPiece() {
    if (!running) return;
    const player = getCurrentPlayer();
    if (!player.alive) return;

    const dropX = 142 + Math.sin(armAngle) * 208;
    const col = Math.max(0, Math.min(CONFIG.cols - 1, Math.floor((dropX - 55) / CONFIG.blockSize)));

    for (let r = CONFIG.rows - 1; r >= 0; r--) {
      const block = grid[r][col];
      if (block && block.state === 'solid') {
        block.height = (block.height || 0) + 1;
        block.placedBy = player.id;

        spawnParticles(dropX, 148 + r * 43 + 12, player.color, 11);
        screenShake = Math.max(screenShake, 7);

        // Pequeña probabilidad de desestabilizar bloques adyacentes
        if (Math.random() < 0.28) {
          const neighbors = [
            grid[r][col - 1],
            grid[r][col + 1],
            grid[r + 1] ? grid[r + 1][col] : null
          ];
          neighbors.forEach(nb => {
            if (nb && nb.state === 'solid' && Math.random() < 0.55) {
              nb.height = (nb.height || 0) + 1;
            }
          });
        }

        setTimeout(() => {
          if (running) {
            applyGravity();
            checkPlayersFall();
            updateHUD();
            nextTurn();
          }
        }, 420);
        return;
      }
    }
  }

  function nextTurn() {
    if (!running) return;

    let nextIndex = (currentPlayerIndex + 1) % players.length;
    let attempts = 0;
    while (!players[nextIndex].alive && attempts < players.length) {
      nextIndex = (nextIndex + 1) % players.length;
      attempts++;
    }

    if (attempts >= players.length) {
      checkWinCondition();
      return;
    }

    currentPlayerIndex = nextIndex;
    turnTimeLeft = CONFIG.turnTime;
    currentPieceType = CONFIG.pieceTypes[Math.floor(Math.random() * CONFIG.pieceTypes.length)];
    armAngle = -0.6;
    armDirection = 1;

    updateHUD();
    updateTurnUI();
    updatePieceUI();
  }

  // ==================== PARTÍCULAS ====================
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 155,
        vy: (Math.random() - 0.5) * 125 - 35,
        life: 0.55 + Math.random() * 0.4,
        color: color,
        size: 3 + Math.random() * 3.2
      });
    }
  }

  function updateParticles(dt) {
    particles = particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 340 * dt;
      return p.life > 0;
    });
  }

  // ==================== RENDER ====================
  function drawBackground() {
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, '#0f172a');
    grd.addColorStop(0.35, '#1e2937');
    grd.addColorStop(0.65, '#334155');
    grd.addColorStop(1, '#1e2937');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Sol tenue
    ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
    ctx.beginPath();
    ctx.arc(canvas.width * 0.78, 110, 70, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPyramid() {
    const startY = 148;
    const bs = CONFIG.blockSize;

    for (let r = 0; r < CONFIG.rows; r++) {
      const width = 2 * r + 1;
      const startCol = Math.floor((CONFIG.cols - width) / 2);

      for (let c = startCol; c < startCol + width; c++) {
        const block = grid[r][c];
        if (!block) continue;

        const x = 55 + c * bs;
        const y = startY + r * 43;

        // Color del bloque
        const isDamaged = block.height > 0;
        ctx.fillStyle = isDamaged ? '#b45309' : '#854d0e';
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2.5;

        ctx.fillRect(x, y, bs - 2, bs - 2);
        ctx.strokeRect(x, y, bs - 2, bs - 2);

        // Borde superior dorado
        ctx.fillStyle = '#fcd34d';
        ctx.fillRect(x + 4, y + 4, bs - 10, 5);

        // Detalle interior
        if (isDamaged) {
          ctx.fillStyle = 'rgba(254, 252, 232, 0.25)';
          ctx.fillRect(x + 6, y + 10, bs - 14, bs * 0.35);
        }
      }
    }
  }

  function drawArm() {
    const baseX = 142;
    const baseY = 155;
    const length = 205;

    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.rotate(armAngle);

    // Brazo principal
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, length);
    ctx.stroke();

    // Segmentos decorativos
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 6;
    for (let i = 1; i < 5; i++) {
      const y = (length / 5) * i;
      ctx.beginPath();
      ctx.moveTo(-5, y);
      ctx.lineTo(5, y);
      ctx.stroke();
    }

    // Gancho
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-16, length - 4);
    ctx.lineTo(0, length + 26);
    ctx.lineTo(16, length - 4);
    ctx.stroke();

    // Bola del gancho
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, length + 29, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Base del brazo
    ctx.fillStyle = '#451a03';
    ctx.fillRect(baseX - 22, baseY - 26, 44, 34);
  }

  function drawPlayers() {
    players.forEach(player => {
      if (!player.alive) return;

      const x = 55 + player.col * CONFIG.blockSize + 23;
      const y = 148 + player.row * 43 - 6;

      // Círculo del avatar
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Ojos
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - 4, y - 2, 3.5, 0, Math.PI * 2);
      ctx.arc(x + 4, y - 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawFallingBlocks() {
    fallingBlocks.forEach(b => {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, 36, 32);
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x, b.y, 36, 32);
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.save();

    if (screenShake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * screenShake,
        (Math.random() - 0.5) * screenShake
      );
      screenShake *= 0.82;
      if (screenShake < 0.6) screenShake = 0;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();
    drawPyramid();
    drawArm();
    drawPlayers();
    drawFallingBlocks();
    drawParticles();

    ctx.restore();
  }

  // ==================== BUCLE PRINCIPAL ====================
  let lastTime = performance.now();

  function gameLoop(now = performance.now()) {
    if (!running) return;

    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    updateArm();
    updateFallingBlocks(dt);
    updateParticles(dt);
    draw();

    requestAnimationFrame(gameLoop);
  }

  // ==================== UI ====================
  function updateHUD() {
    hudEl.innerHTML = '';
    players.forEach((player, index) => {
      const div = document.createElement('div');
      div.className = `hud-player ${!player.alive ? 'out' : ''}`;

      let hearts = '';
      for (let i = 0; i < CONFIG.maxLives; i++) {
        hearts += `<div class="life ${i >= player.lives ? 'lost' : ''}"></div>`;
      }

      div.innerHTML = `
        <span class="dot" style="background:${player.color}"></span>
        <span><strong>${player.name}</strong></span>
        <div class="lives">${hearts}</div>
      `;

      if (index === currentPlayerIndex && player.alive) {
        div.style.boxShadow = `0 0 0 3px ${player.color}`;
      }

      hudEl.appendChild(div);
    });
  }

  function updateTurnUI() {
    const player = getCurrentPlayer();
    if (currentTurnEl) {
      currentTurnEl.innerHTML = `<span style="color:${player.color}">●</span> Turno de <strong>${player.name}</strong>`;
    }
  }

  function updatePieceUI() {
    if (currentPieceEl) {
      currentPieceEl.innerHTML = `<span style="font-size:2.3rem; font-weight:900; color:#fcd34d;">${currentPieceType}</span>`;
    }
  }

  function startTurnTimer() {
    if (turnTimer) clearInterval(turnTimer);
    turnTimer = setInterval(() => {
      if (!running) return;
      turnTimeLeft--;
      if (timerEl) timerEl.textContent = turnTimeLeft;

      if (turnTimeLeft <= 0) {
        clearInterval(turnTimer);
        nextTurn();
      }
    }, 1000);
  }

  function startCountdown() {
    let count = 3;
    const interval = setInterval(() => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#fcd34d';
      ctx.font = 'bold 130px Orbitron';
      ctx.textAlign = 'center';

      if (count > 0) {
        ctx.fillText(count, canvas.width / 2, canvas.height / 2 + 45);
      } else {
        clearInterval(interval);
        ctx.fillText('START', canvas.width / 2, canvas.height / 2 + 45);
        setTimeout(() => {
          startTurnTimer();
          gameLoop();
        }, 650);
      }
      count--;
    }, 780);
  }

  function startGame() {
    createGrid();
    initPlayers(3);
    particles = [];
    fallingBlocks = [];
    currentPlayerIndex = 0;
    turnTimeLeft = CONFIG.turnTime;
    armAngle = -0.6;
    armDirection = 1;
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
    }, 1350);
  }

  function restartGame() {
    if (turnTimer) clearInterval(turnTimer);
    showScreen('menu');
    running = false;
  }

  // ==================== EVENTOS ====================
  document.querySelectorAll('.player-selector button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-selector button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  window.addEventListener('keydown', (e) => {
    if (!running) return;
    const player = getCurrentPlayer();
    if (!player || !player.alive) return;

    if (e.code === player.keys.left) armAngle -= 0.13;
    if (e.code === player.keys.right) armAngle += 0.13;
    if (e.code === player.keys.action || e.code === 'Space') {
      e.preventDefault();
      dropPiece();
    }
  });

  // ==================== INICIALIZACIÓN ====================
  function init() {
    canvas.width = 860;
    canvas.height = 620;

    showScreen('menu');
    console.log('%c[Prickly Pyramids] Repositorio reconstruido correctamente.', 'color:#fbbf24');
  }

  init();
})();