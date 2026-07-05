(function () {
  'use strict';

  const CONFIG = {
    rows: 7,
    blockSize: 46,
    maxLives: 3,
    turnTime: 30,
    players: [
      { id: 1, name: 'Jugador 1', color: '#ef4444', keys: { left: 'ArrowLeft', right: 'ArrowRight', action: 'Space' } },
      { id: 2, name: 'Jugador 2', color: '#22c55e', keys: { left: 'KeyA', right: 'KeyD', action: 'KeyF' } },
      { id: 3, name: 'Jugador 3', color: '#3b82f6', keys: { left: 'KeyJ', right: 'KeyL', action: 'KeyK' } },
      { id: 4, name: 'Jugador 4', color: '#a855f7', keys: { left: 'KeyU', right: 'KeyO', action: 'KeyI' } },
    ],
    pieceTypes: ['I', 'T', 'L', 'O', 'S']
  };

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
  const timerEl = document.getElementById('timer');
  const currentTurnEl = document.getElementById('current-turn');
  const currentPieceEl = document.getElementById('current-piece');

  let selectedPlayerCount = 3;
  let grid = [];
  let players = [];
  let particles = [];
  let running = false;
  let currentPlayerIndex = 0;
  let turnTimeLeft = CONFIG.turnTime;
  let turnTimer = null;
  let armAngle = -0.7;
  let armDirection = 1;
  let currentPieceType = 'T';
  let keysDown = new Set();
  let countdown = 0;
  let countdownActive = false;

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove('screen--active'));
    screens[name].classList.add('screen--active');
  }

  function buildControlsPreview() {
    controlsPreview.innerHTML = '';
    CONFIG.players.slice(0, selectedPlayerCount).forEach((p) => {
      const row = document.createElement('div');
      row.className = 'control-row';
      row.innerHTML = `
        <span class="dot" style="background:${p.color}"></span>
        <span><strong>${p.name}</strong> — ← → + ${p.keys.action}</span>
      `;
      controlsPreview.appendChild(row);
    });
  }

  function createGrid() {
    grid = [];
    for (let r = 0; r < CONFIG.rows; r++) {
      grid[r] = [];
      for (let c = 0; c < 13; c++) {
        const width = 2 * r + 1;
        const startCol = Math.floor((13 - width) / 2);
        if (c >= startCol && c < startCol + width) {
          grid[r][c] = { state: 'solid', height: 0, placedBy: null };
        } else {
          grid[r][c] = null;
        }
      }
    }
  }

  function initPlayers(count) {
    players = CONFIG.players.slice(0, count).map((cfg) => ({
      ...cfg,
      lives: CONFIG.maxLives,
      alive: true,
      score: 0
    }));
  }

  function getCurrentPlayer() {
    return players[currentPlayerIndex];
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
      endGame();
      return;
    }

    currentPlayerIndex = nextIndex;
    turnTimeLeft = CONFIG.turnTime;
    currentPieceType = CONFIG.pieceTypes[Math.floor(Math.random() * CONFIG.pieceTypes.length)];

    updateHUD();
    updateCurrentTurnUI();
    updateCurrentPieceUI();

    armAngle = -0.7;
    armDirection = 1;
  }

  function startTurnTimer() {
    if (turnTimer) clearInterval(turnTimer);
    turnTimer = setInterval(() => {
      if (!running) { clearInterval(turnTimer); return; }
      turnTimeLeft--;
      if (timerEl) timerEl.textContent = turnTimeLeft;
      if (turnTimeLeft <= 0) {
        clearInterval(turnTimer);
        nextTurn();
      }
    }, 1000);
  }

  function updateHUD() {
    hudEl.innerHTML = '';
    players.forEach((player, index) => {
      const div = document.createElement('div');
      div.className = `hud-player ${!player.alive ? 'hud-player--out' : ''}`;
      let hearts = '';
      for (let i = 0; i < CONFIG.maxLives; i++) {
        hearts += `<div class="life ${i >= player.lives ? 'life--lost' : ''}"></div>`;
      }
      div.innerHTML = `
        <span class="dot" style="background:${player.color}"></span>
        <span><strong>${player.name}</strong></span>
        <div class="lives">${hearts}</div>
      `;
      if (index === currentPlayerIndex && player.alive) {
        div.style.boxShadow = `0 0 0 4px ${player.color}`;
      }
      hudEl.appendChild(div);
    });
  }

  function updateCurrentTurnUI() {
    const player = getCurrentPlayer();
    if (currentTurnEl) {
      currentTurnEl.innerHTML = `<span style="color:${player.color}">●</span> Turno de <strong>${player.name}</strong>`;
      currentTurnEl.style.borderColor = player.color;
    }
  }

  function updateCurrentPieceUI() {
    if (currentPieceEl) {
      currentPieceEl.innerHTML = `<span style="font-size:2.4rem; font-weight:900; color:#ec4899;">${currentPieceType}</span>`;
    }
  }

  // ==================== BRAZO MEJORADO (estilo capturas) ====================
  function updateArm() {
    if (!running || countdownActive) return;
    armAngle += armDirection * 0.032;
    if (armAngle > 0.9) armDirection = -1;
    if (armAngle < -0.9) armDirection = 1;
  }

  function drawArm() {
    const centerX = 140; // Brazo viene desde la izquierda
    const baseY = 160;
    const armLength = 210;

    ctx.save();
    ctx.translate(centerX, baseY);
    ctx.rotate(armAngle);

    // Brazo segmentado estilo caña de caramelo
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, armLength);
    ctx.stroke();

    // Segmentos decorativos
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 10;
    for (let i = 1; i < 5; i++) {
      const y = (armLength / 5) * i;
      ctx.beginPath();
      ctx.moveTo(-8, y - 6);
      ctx.lineTo(8, y + 6);
      ctx.stroke();
    }

    // Gancho / garra
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-22, armLength - 8);
    ctx.lineTo(0, armLength + 32);
    ctx.lineTo(22, armLength - 8);
    ctx.stroke();

    // Bola del gancho
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, armLength + 35, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();

    // Base del brazo
    ctx.fillStyle = '#451a03';
    ctx.fillRect(centerX - 28, baseY - 30, 56, 40);
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(centerX - 20, baseY - 22, 40, 26);
  }

  function dropPiece() {
    if (!running || countdownActive) return;
    const player = getCurrentPlayer();
    if (!player.alive) return;

    const dropX = 140 + Math.sin(armAngle) * 210;
    const col = Math.max(0, Math.min(12, Math.floor((dropX - 60) / CONFIG.blockSize)));

    let placed = false;
    for (let r = CONFIG.rows - 1; r >= 0; r--) {
      if (grid[r] && grid[r][col] && grid[r][col].state === 'solid') {
        grid[r][col].height = (grid[r][col].height || 0) + 1;
        grid[r][col].placedBy = player.id;
        spawnParticles(dropX, 95 + r * CONFIG.blockSize * 0.9, player.color, 14);
        player.score += 10;
        placed = true;
        break;
      }
    }

    if (placed) {
      setTimeout(() => {
        if (running) {
          clearInterval(turnTimer);
          nextTurn();
          startTurnTimer();
        }
      }, 550);
    } else {
      spawnParticles(dropX, 480, '#ef4444', 8);
    }
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 160 - 50,
        life: 0.55 + Math.random() * 0.45,
        color,
        size: 3.5 + Math.random() * 3.5
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

  // ==================== DIBUJO MEJORADO ====================
  function drawBackground() {
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, '#4ade80');
    grd.addColorStop(0.35, '#86efac');
    grd.addColorStop(1, '#fefce8');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Nubes
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 7; i++) {
      const x = (i * 115 + 20) % canvas.width;
      const y = 35 + (i % 3) * 28;
      ctx.beginPath();
      ctx.ellipse(x, y, 42, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 28, y - 4, 30, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pirámides de fondo
    ctx.fillStyle = '#854d0e';
    ctx.beginPath();
    ctx.moveTo(60, 540);
    ctx.lineTo(180, 380);
    ctx.lineTo(300, 540);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(480, 540);
    ctx.lineTo(600, 395);
    ctx.lineTo(720, 540);
    ctx.fill();
  }

  function drawPyramid() {
    const startY = 145;
    const bs = CONFIG.blockSize;

    for (let r = 0; r < CONFIG.rows; r++) {
      const width = 2 * r + 1;
      const startCol = Math.floor((13 - width) / 2);

      for (let c = startCol; c < startCol + width; c++) {
        const x = 55 + c * bs;
        const y = startY + r * (bs * 0.88);

        const block = grid[r] && grid[r][c];
        if (!block) continue;

        let fill = '#854d0e';
        let stroke = '#451a03';

        if (block.height && block.height > 0) {
          fill = '#ec4899';
          stroke = '#9d174d';
        }

        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 3;
        ctx.fillRect(x, y, bs - 3, bs - 3);
        ctx.strokeRect(x, y, bs - 3, bs - 3);

        // Detalle superior
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + 5, y + 5, bs - 14, bs * 0.32);

        if (block.height > 0) {
          ctx.fillStyle = '#fefce8';
          ctx.font = 'bold 16px Orbitron';
          ctx.textAlign = 'center';
          ctx.fillText('𓂀', x + bs/2 - 1, y + bs/2 + 6);
        }
      }
    }
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / 1.1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawTurnBanner() {
    if (!running || countdownActive) return;
    const player = getCurrentPlayer();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, 48);

    ctx.fillStyle = '#fefce8';
    ctx.font = 'bold 22px Rajdhani';
    ctx.textAlign = 'center';
    ctx.fillText(`${player.name}'s Turn`, canvas.width / 2, 33);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawPyramid();
    drawArm();
    drawParticles();
    drawTurnBanner();

    // Pieza que cae (visual)
    if (running && !countdownActive) {
      const dropX = 140 + Math.sin(armAngle) * 210;
      ctx.fillStyle = '#ec4899';
      ctx.strokeStyle = '#9d174d';
      ctx.lineWidth = 3;
      ctx.fillRect(dropX - 18, 95, 36, 32);
      ctx.strokeRect(dropX - 18, 95, 36, 32);
      ctx.fillStyle = '#fefce8';
      ctx.font = 'bold 20px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText(currentPieceType, dropX, 118);
    }
  }

  let lastTime = performance.now();

  function gameLoop(now = performance.now()) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    updateArm();
    updateParticles(dt);
    draw();

    requestAnimationFrame(gameLoop);
  }

  function startCountdown() {
    countdownActive = true;
    countdown = 3;
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        // Mostrar número grande
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fb923c';
        ctx.font = 'bold 120px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(countdown, canvas.width / 2, canvas.height / 2 + 40);
      } else {
        clearInterval(countdownInterval);
        countdownActive = false;
        startTurnTimer();
        gameLoop();
      }
    }, 900);
  }

  function startGame() {
    createGrid();
    initPlayers(selectedPlayerCount);
    particles = [];
    currentPlayerIndex = 0;
    turnTimeLeft = CONFIG.turnTime;
    armAngle = -0.7;
    armDirection = 1;
    currentPieceType = 'T';

    running = true;
    showScreen('game');
    updateHUD();
    updateCurrentTurnUI();
    updateCurrentPieceUI();
    if (timerEl) timerEl.textContent = turnTimeLeft;

    // Iniciar cuenta regresiva
    setTimeout(() => {
      startCountdown();
    }, 300);
  }

  function endGame() {
    running = false;
    if (turnTimer) clearInterval(turnTimer);

    const alive = players.filter(p => p.alive);
    showScreen('result');

    if (alive.length === 1) {
      const w = alive[0];
      resultTitle.textContent = '¡Victoria!';
      resultMessage.innerHTML = `<strong style="color:${w.color}">${w.name}</strong> es el último en pie.<br>Puntuación: ${w.score}`;
    } else {
      resultTitle.textContent = 'Fin de la partida';
      resultMessage.textContent = 'Todos los jugadores han caído.';
    }
  }

  function restartGame() {
    if (turnTimer) clearInterval(turnTimer);
    showScreen('menu');
    running = false;
  }

  // Eventos
  document.querySelectorAll('.player-selector button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-selector button').forEach(b => b.classList.remove('btn--selected'));
      btn.classList.add('btn--selected');
      selectedPlayerCount = parseInt(btn.dataset.players);
      buildControlsPreview();
    });
  });

  document.getElementById('start-btn').addEventListener('click', () => startGame());
  document.getElementById('restart-btn').addEventListener('click', () => restartGame());

  window.addEventListener('keydown', (e) => {
    keysDown.add(e.code);
    if (!running || countdownActive) return;
    const p = getCurrentPlayer();
    if (!p.alive) return;

    if (e.code === p.keys.left) armAngle -= 0.16;
    if (e.code === p.keys.right) armAngle += 0.16;
    if (e.code === p.keys.action || e.code === 'Space') {
      e.preventDefault();
      dropPiece();
    }
  });

  window.addEventListener('keyup', (e) => keysDown.delete(e.code));

  function init() {
    buildControlsPreview();
    canvas.width = 820;
    canvas.height = 600;
    console.log('%c[Prickly Pyramids] Versión mejorada con brazo segmentado y estilo más cercano a tus capturas.', 'color:#854d0e');
  }

  init();
})();