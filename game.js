(function () {
  'use strict';

  // ==================== CONFIG ====================
  const CONFIG = {
    rows: 7,
    cols: 13,
    blockSize: 48,
    maxLives: 3,
    turnTime: 25,
    gravity: 420,
    instabilityChance: 0.35, // Probabilidad de que bloques vecinos se desestabilicen
    players: [
      { id: 1, name: 'Jugador 1', color: '#f97316', keys: { left: 'ArrowLeft', right: 'ArrowRight', action: 'Space' } },
      { id: 2, name: 'Jugador 2', color: '#22c55e', keys: { left: 'KeyA', right: 'KeyD', action: 'KeyF' } },
      { id: 3, name: 'Jugador 3', color: '#3b82f6', keys: { left: 'KeyJ', right: 'KeyL', action: 'KeyK' } },
      { id: 4, name: 'Jugador 4', color: '#a855f7', keys: { left: 'KeyU', right: 'KeyO', action: 'KeyI' } },
    ],
    pieceTypes: ['I', 'T', 'L', 'O', 'S']
  };

  // ==================== VARIABLES ====================
  const screens = {
    menu: document.getElementById('menu-screen'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen'),
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
  let armAngle = -0.65;
  let armDirection = 1;
  let currentPieceType = 'T';
  let screenShake = 0;
  let keysDown = new Set();

  // ==================== UTILIDADES ====================
  function showScreen(name) {
    Object.values(screens).forEach(el => el.classList.remove('screen--active'));
    screens[name].classList.add('screen--active');
  }

  function getCurrentPlayer() {
    return players[currentPlayerIndex];
  }

  function updateHUD() {
    hudEl.innerHTML = '';
    players.forEach((player, index) => {
      const div = document.createElement('div');
      div.className = `hud-player ${!player.alive ? 'hud-player--out' : ''}`;
      let heartsHTML = '';
      for (let i = 0; i < CONFIG.maxLives; i++) {
        const lost = i >= player.lives;
        heartsHTML += `<div class="life ${lost ? 'life--lost' : ''} ${lost && player.justLostLife ? 'blink' : ''}"></div>`;
      }
      div.innerHTML = `
        <span class="dot" style="background:${player.color}"></span>
        <span><strong>${player.name}</strong></span>
        <div class="lives">${heartsHTML}</div>
      `;
      if (index === currentPlayerIndex && player.alive) {
        div.style.boxShadow = `0 0 0 4px ${player.color}`;
      }
      hudEl.appendChild(div);
    });
  }

  function updateCurrentTurnUI() {
    const p = getCurrentPlayer();
    if (currentTurnEl) {
      currentTurnEl.innerHTML = `<span style="color:${p.color}">●</span> Turno de <strong>${p.name}</strong>`;
      currentTurnEl.style.borderColor = p.color;
    }
  }

  function updateCurrentPieceUI() {
    if (currentPieceEl) currentPieceEl.innerHTML = `<span style="font-size:2.5rem; font-weight:900; color:#f59e0b;">${currentPieceType}</span>`;
  }

  // ==================== GRID & PLAYERS ====================
  function createGrid() {
    grid = [];
    for (let r = 0; r < CONFIG.rows; r++) {
      grid[r] = [];
      for (let c = 0; c < CONFIG.cols; c++) {
        const width = 2 * r + 1;
        const startCol = Math.floor((CONFIG.cols - width) / 2);
        if (c >= startCol && c < startCol + width) {
          grid[r][c] = { state: 'solid', height: 0, placedBy: null };
        } else {
          grid[r][c] = null;
        }
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
        score: 0,
        justLostLife: false
      };
    });
  }

  function getBlockAt(row, col) {
    if (row < 0 || row >= CONFIG.rows || col < 0 || col >= CONFIG.cols) return null;
    return grid[row] ? grid[row][col] : null;
  }

  // ==================== FÍSICA Y CAÍDA ====================
  function checkAndMakeBlocksFall() {
    let fell = false;
    for (let r = CONFIG.rows - 2; r >= 0; r--) {
      for (let c = 0; c < CONFIG.cols; c++) {
        const block = grid[r][c];
        if (!block || block.state !== 'solid') continue;

        const below = getBlockAt(r + 1, c);
        if (!below || below.state !== 'solid') {
          // Bloque sin soporte → cae
          fallingBlocks.push({
            row: r,
            col: c,
            x: 55 + c * CONFIG.blockSize,
            y: 145 + r * (CONFIG.blockSize * 0.88),
            vy: 80 + Math.random() * 60,
            life: 1.2,
            color: block.height > 0 ? '#ec4899' : '#854d0e'
          });
          grid[r][c] = null;
          fell = true;
        }
      }
    }
    if (fell && screenShake < 8) screenShake = 12;
    return fell;
  }

  function updateFallingBlocks(dt) {
    fallingBlocks = fallingBlocks.filter(block => {
      block.y += block.vy * dt;
      block.vy += CONFIG.gravity * dt;
      block.life -= dt;

      // Si llega al suelo o se acaba la vida, desaparece
      if (block.y > canvas.height - 80 || block.life <= 0) {
        spawnParticles(block.x + 20, block.y + 20, block.color, 8);
        return false;
      }
      return true;
    });
  }

  // ==================== CAÍDA DE JUGADORES ====================
  function checkPlayersFall() {
    players.forEach(player => {
      if (!player.alive) return;
      const block = getBlockAt(player.row, player.col);
      if (!block || block.state !== 'solid') {
        // El jugador se queda sin suelo
        player.lives--;
        player.justLostLife = true;
        setTimeout(() => { if (player) player.justLostLife = false; }, 800);

        spawnParticles(
          55 + player.col * CONFIG.blockSize + 24,
          145 + player.row * (CONFIG.blockSize * 0.88) + 30,
          player.color, 18
        );

        if (player.lives <= 0) {
          player.alive = false;
          checkWin();
        } else {
          // Reaparecer en bloque sólido más alto posible
          for (let r = CONFIG.rows - 1; r >= 0; r--) {
            for (let c = 0; c < CONFIG.cols; c++) {
              if (getBlockAt(r, c)) {
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

  function checkWin() {
    const alive = players.filter(p => p.alive);
    if (alive.length <= 1 && running) {
      running = false;
      if (turnTimer) clearInterval(turnTimer);
      setTimeout(() => {
        showScreen('result');
        const winner = alive[0];
        if (winner) {
          resultTitle.textContent = '¡Victoria!';
          resultMessage.innerHTML = `<strong style="color:${winner.color}">${winner.name}</strong> es el último en pie.`;
        } else {
          resultTitle.textContent = 'Empate';
          resultMessage.textContent = 'Todos cayeron al vacío.';
        }
      }, 1200);
    }
  }

  // ==================== BRAZO Y PIEZAS ====================
  function updateArm() {
    if (!running) return;
    armAngle += armDirection * 0.028;
    if (armAngle > 0.85) armDirection = -1;
    if (armAngle < -0.85) armDirection = 1;
  }

  function dropPiece() {
    if (!running) return;
    const player = getCurrentPlayer();
    if (!player.alive) return;

    const dropX = 140 + Math.sin(armAngle) * 215;
    const col = Math.max(0, Math.min(CONFIG.cols - 1, Math.floor((dropX - 55) / CONFIG.blockSize)));

    let hit = false;
    for (let r = CONFIG.rows - 1; r >= 0; r--) {
      const block = grid[r][col];
      if (block && block.state === 'solid') {
        // Impacto: puede desestabilizar bloques vecinos
        block.height = (block.height || 0) + 1;
        block.placedBy = player.id;

        // Probabilidad de desestabilizar bloques adyacentes
        if (Math.random() < CONFIG.instabilityChance) {
          const neighbors = [
            getBlockAt(r, col - 1),
            getBlockAt(r, col + 1),
            getBlockAt(r + 1, col)
          ];
          neighbors.forEach(nb => {
            if (nb && nb.state === 'solid' && Math.random() < 0.6) {
              nb.height = (nb.height || 0) + 1; // Marca como dañado
            }
          });
        }

        spawnParticles(dropX, 145 + r * (CONFIG.blockSize * 0.88) + 20, player.color, 12);
        if (screenShake < 6) screenShake = 9;
        hit = true;
        break;
      }
    }

    // Después de impactar, revisamos caídas
    if (hit) {
      setTimeout(() => {
        if (running) {
          checkAndMakeBlocksFall();
          checkPlayersFall();
          updateHUD();
          nextTurn();
        }
      }, 420);
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
    if (tries >= players.length) { checkWin(); return; }

    currentPlayerIndex = next;
    turnTimeLeft = CONFIG.turnTime;
    currentPieceType = CONFIG.pieceTypes[Math.floor(Math.random() * CONFIG.pieceTypes.length)];
    armAngle = -0.65;
    armDirection = 1;

    updateHUD();
    updateCurrentTurnUI();
    updateCurrentPieceUI();
  }

  // ==================== PARTÍCULAS ====================
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 170,
        vy: (Math.random() - 0.5) * 140 - 40,
        life: 0.6 + Math.random() * 0.5,
        color,
        size: 3 + Math.random() * 4
      });
    }
  }

  function updateParticles(dt) {
    particles = particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 380 * dt;
      return p.life > 0;
    });
  }

  // ==================== DIBUJO EGIPCIO ====================
  function drawBackground() {
    // Atardecer egipcio
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, '#1e2937');
    grd.addColorStop(0.25, '#334155');
    grd.addColorStop(0.55, '#854d0e');
    grd.addColorStop(1, '#f59e0b');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Sol poniente
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(canvas.width * 0.75, 95, 55, 0, Math.PI * 2);
    ctx.fill();

    // Nubes doradas
    ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
    for (let i = 0; i < 5; i++) {
      const x = (i * 160 + 40) % canvas.width;
      ctx.beginPath();
      ctx.ellipse(x, 70 + (i % 2) * 25, 55, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPyramid() {
    const startY = 145;
    const bs = CONFIG.blockSize;

    for (let r = 0; r < CONFIG.rows; r++) {
      const width = 2 * r + 1;
      const startCol = Math.floor((CONFIG.cols - width) / 2);

      for (let c = startCol; c < startCol + width; c++) {
        const block = grid[r][c];
        if (!block) continue;

        const x = 55 + c * bs;
        const y = startY + r * (bs * 0.88);

        // Color según estado
        let fill = block.height > 0 ? '#b45309' : '#854d0e';
        let stroke = '#451a03';

        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 3;
        ctx.fillRect(x, y, bs - 2, bs - 2);
        ctx.strokeRect(x, y, bs - 2, bs - 2);

        // Borde superior dorado (estilo egipcio)
        ctx.fillStyle = '#fcd34d';
        ctx.fillRect(x + 3, y + 3, bs - 8, 6);

        // Jeroglíficos simples
        if (block.height > 0) {
          ctx.fillStyle = '#fefce8';
          ctx.font = 'bold 15px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('𓂀', x + bs/2, y + bs/2 + 5);
        }
      }
    }
  }

  function drawArm() {
    const cx = 135;
    const baseY = 155;
    const len = 225;

    ctx.save();
    ctx.translate(cx, baseY);
    ctx.rotate(armAngle);

    // Brazo principal
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, len);
    ctx.stroke();

    // Segmentos dorados
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 8;
    for (let i = 1; i < 6; i++) {
      const yy = (len / 6) * i;
      ctx.beginPath();
      ctx.moveTo(-6, yy);
      ctx.lineTo(6, yy);
      ctx.stroke();
    }

    // Gancho
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-20, len - 5);
    ctx.lineTo(0, len + 30);
    ctx.lineTo(20, len - 5);
    ctx.stroke();

    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, len + 33, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Base
    ctx.fillStyle = '#451a03';
    ctx.fillRect(cx - 25, baseY - 28, 50, 38);
  }

  function drawPlayers() {
    players.forEach(player => {
      if (!player.alive) return;
      const x = 55 + player.col * CONFIG.blockSize + 24;
      const y = 145 + player.row * (CONFIG.blockSize * 0.88) - 8;

      // Círculo del avatar
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Ojos simples
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - 5, y - 3, 4, 0, Math.PI * 2);
      ctx.arc(x + 5, y - 3, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawFallingBlocks() {
    fallingBlocks.forEach(b => {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, 38, 34);
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, 38, 34);
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
      ctx.translate(Math.random() * screenShake - screenShake/2, Math.random() * screenShake - screenShake/2);
      screenShake *= 0.85;
      if (screenShake < 0.5) screenShake = 0;
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

  // ==================== BUCLE ====================
  let lastTime = performance.now();

  function gameLoop(now = performance.now()) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000, 0.12);
    lastTime = now;

    updateArm();
    updateFallingBlocks(dt);
    updateParticles(dt);
    draw();

    requestAnimationFrame(gameLoop);
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

  function startGame() {
    createGrid();
    initPlayers(selectedPlayerCount);
    particles = [];
    fallingBlocks = [];
    currentPlayerIndex = 0;
    turnTimeLeft = CONFIG.turnTime;
    armAngle = -0.65;
    armDirection = 1;
    currentPieceType = 'T';
    screenShake = 0;

    running = true;
    showScreen('game');
    updateHUD();
    updateCurrentTurnUI();
    updateCurrentPieceUI();
    if (timerEl) timerEl.textContent = turnTimeLeft;

    startTurnTimer();
    gameLoop();
  }

  function restartGame() {
    if (turnTimer) clearInterval(turnTimer);
    showScreen('menu');
    running = false;
  }

  // ==================== EVENTOS ====================
  document.querySelectorAll('.player-selector button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-selector button').forEach(b => b.classList.remove('btn--selected'));
      btn.classList.add('btn--selected');
      selectedPlayerCount = parseInt(btn.dataset.players);
    });
  });

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  window.addEventListener('keydown', e => {
    keysDown.add(e.code);
    if (!running) return;
    const p = getCurrentPlayer();
    if (!p || !p.alive) return;

    if (e.code === p.keys.left) armAngle -= 0.15;
    if (e.code === p.keys.right) armAngle += 0.15;
    if (e.code === p.keys.action || e.code === 'Space') {
      e.preventDefault();
      dropPiece();
    }
  });

  window.addEventListener('keyup', e => keysDown.delete(e.code));

  function init() {
    canvas.width = 860;
    canvas.height = 620;
    console.log('%c[Prickly Pyramids] Versión Egipcia + Física de Caída + Avatares implementada.', 'color:#f59e0b');
  }

  init();
})();