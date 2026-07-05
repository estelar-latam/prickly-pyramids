(function () {
  'use strict';

  // ==================== CONFIGURACIÓN ====================
  const CONFIG = {
    rows: 6,
    blockSize: 48,
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

  // ==================== VARIABLES GLOBALES ====================
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
  let armAngle = 0;
  let armDirection = 1;
  let currentPiece = 'T';
  let placedPieces = [];
  let keysDown = new Set();

  // ==================== FUNCIONES DE PANTALLA ====================
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

  // ==================== LÓGICA DEL JUEGO ====================
  function createGrid() {
    grid = [];
    for (let r = 0; r < CONFIG.rows; r++) {
      grid[r] = [];
      for (let c = 0; c < 11; c++) {
        const width = 2 * r + 1;
        const startCol = Math.floor((11 - width) / 2);
        if (c >= startCol && c < startCol + width) {
          grid[r][c] = { state: 'solid', height: 0 };
        } else {
          grid[r][c] = null;
        }
      }
    }
  }

  function initPlayers(count) {
    players = CONFIG.players.slice(0, count).map((cfg, i) => ({
      ...cfg,
      lives: CONFIG.maxLives,
      alive: true,
      score: 0,
      lastAction: 0
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
    currentPiece = CONFIG.pieceTypes[Math.floor(Math.random() * CONFIG.pieceTypes.length)];
    
    updateHUD();
    updateCurrentTurnUI();
    updateCurrentPieceUI();

    armAngle = -0.6;
    armDirection = 1;
  }

  function startTurnTimer() {
    if (turnTimer) clearInterval(turnTimer);
    
    turnTimer = setInterval(() => {
      if (!running) {
        clearInterval(turnTimer);
        return;
      }
      
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
      
      let heartsHTML = '';
      for (let i = 0; i < CONFIG.maxLives; i++) {
        heartsHTML += `<div class="life ${i >= player.lives ? 'life--lost' : ''}"></div>`;
      }
      
      div.innerHTML = `
        <span class="dot" style="background:${player.color}"></span>
        <span><strong>${player.name}</strong></span>
        <div class="lives">${heartsHTML}</div>
      `;
      
      if (index === currentPlayerIndex && player.alive) {
        div.style.boxShadow = `0 0 0 4px ${player.color}`;
        div.style.border = `3px solid ${player.color}`;
      }
      
      hudEl.appendChild(div);
    });
  }

  function updateCurrentTurnUI() {
    const player = getCurrentPlayer();
    if (currentTurnEl) {
      currentTurnEl.innerHTML = `
        <span style="color:${player.color}">●</span> 
        Turno de <strong>${player.name}</strong>
      `;
      currentTurnEl.style.borderColor = player.color;
    }
  }

  function updateCurrentPieceUI() {
    if (currentPieceEl) {
      currentPieceEl.innerHTML = `<span style="font-size:2.2rem; font-weight:900; color:#ec4899;">${currentPiece}</span>`;
    }
  }

  // ==================== BRAZO Y PIEZAS ====================
  function updateArm() {
    if (!running) return;
    
    armAngle += armDirection * 0.035;
    
    if (armAngle > 0.85) {
      armDirection = -1;
    } else if (armAngle < -0.85) {
      armDirection = 1;
    }
  }

  function dropPiece() {
    if (!running) return;
    
    const player = getCurrentPlayer();
    if (!player.alive) return;

    const centerX = canvas.width / 2;
    const armLength = 180;
    const dropX = centerX + Math.sin(armAngle) * armLength;
    
    const col = Math.floor(dropX / CONFIG.blockSize);
    
    let placed = false;
    
    for (let r = CONFIG.rows - 1; r >= 0; r--) {
      if (grid[r] && grid[r][col] && grid[r][col].state === 'solid') {
        grid[r][col].height = (grid[r][col].height || 0) + 1;
        grid[r][col].placedBy = player.id;
        
        spawnParticles(dropX, 120 + r * CONFIG.blockSize, player.color, 12);
        
        placed = true;
        player.score += 10;
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
      }, 600);
    } else {
      spawnParticles(dropX, 500, '#ef4444', 8);
    }
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 180,
        vy: (Math.random() - 0.5) * 180 - 60,
        life: 0.6 + Math.random() * 0.5,
        color: color,
        size: 3 + Math.random() * 4
      });
    }
  }

  function updateParticles(dt) {
    particles = particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      return p.life > 0;
    });
  }

  // ==================== DIBUJO ====================
  function drawBackground() {
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, '#4ade80');
    grd.addColorStop(0.4, '#86efac');
    grd.addColorStop(1, '#fefce8');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 6; i++) {
      const x = (i * 140 + 30) % canvas.width;
      const y = 45 + (i % 3) * 35;
      ctx.beginPath();
      ctx.ellipse(x, y, 38, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 25, y - 5, 28, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#854d0e';
    ctx.beginPath();
    ctx.moveTo(80, 520);
    ctx.lineTo(220, 320);
    ctx.lineTo(360, 520);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(440, 520);
    ctx.lineTo(580, 340);
    ctx.lineTo(720, 520);
    ctx.fill();
  }

  function drawPyramid() {
    const startY = 180;
    const blockSize = CONFIG.blockSize;

    for (let r = 0; r < CONFIG.rows; r++) {
      const width = 2 * r + 1;
      const startCol = Math.floor((11 - width) / 2);
      
      for (let c = startCol; c < startCol + width; c++) {
        const x = c * blockSize + 40;
        const y = startY + r * (blockSize * 0.85);
        
        const block = grid[r] && grid[r][c];
        if (!block) continue;

        let fillColor = '#854d0e';
        let strokeColor = '#451a03';
        
        if (block.height && block.height > 0) {
          fillColor = '#ec4899';
          strokeColor = '#9d174d';
        }

        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3;
        
        ctx.fillRect(x, y, blockSize - 4, blockSize - 4);
        ctx.strokeRect(x, y, blockSize - 4, blockSize - 4);
        
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x + 6, y + 6, blockSize - 16, blockSize * 0.35);
        
        if (block.height > 0) {
          ctx.fillStyle = '#fefce8';
          ctx.font = 'bold 18px Orbitron';
          ctx.textAlign = 'center';
          ctx.fillText('𓂀', x + blockSize/2 - 2, y + blockSize/2 + 8);
        }
      }
    }
  }

  function drawArm() {
    const centerX = canvas.width / 2;
    const baseY = 95;
    const armLength = 195;
    
    ctx.save();
    ctx.translate(centerX, baseY);
    ctx.rotate(armAngle);

    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, armLength);
    ctx.stroke();

    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, armLength);
    ctx.stroke();

    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-18, armLength - 10);
    ctx.lineTo(0, armLength + 25);
    ctx.lineTo(18, armLength - 10);
    ctx.stroke();

    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(0, armLength + 28, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();

    ctx.fillStyle = '#451a03';
    ctx.fillRect(centerX - 35, baseY - 25, 70, 35);
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(centerX - 28, baseY - 18, 56, 22);
  }

  function drawParticles() {
    particles.forEach(p => {
      const alpha = Math.max(0, p.life / 1.2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawBackground();
    drawPyramid();
    drawArm();
    drawParticles();
  }

  // ==================== BUCLE PRINCIPAL ====================
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

  // ==================== CONTROLES ====================
  function handleKeyDown(e) {
    keysDown.add(e.code);

    if (!running) return;

    const player = getCurrentPlayer();
    if (!player.alive) return;

    if (e.code === player.keys.left) {
      armAngle -= 0.18;
    }
    
    if (e.code === player.keys.right) {
      armAngle += 0.18;
    }
    
    if (e.code === player.keys.action || e.code === 'Space') {
      e.preventDefault();
      dropPiece();
    }
  }

  function handleKeyUp(e) {
    keysDown.delete(e.code);
  }

  // ==================== INICIO Y FIN ====================
  function startGame() {
    createGrid();
    initPlayers(selectedPlayerCount);
    placedPieces = [];
    particles = [];
    currentPlayerIndex = 0;
    turnTimeLeft = CONFIG.turnTime;
    armAngle = -0.5;
    armDirection = 1;
    currentPiece = 'T';

    running = true;

    showScreen('game');
    updateHUD();
    updateCurrentTurnUI();
    updateCurrentPieceUI();
    
    if (timerEl) timerEl.textContent = turnTimeLeft;

    startTurnTimer();
    gameLoop();
  }

  function endGame() {
    running = false;
    if (turnTimer) clearInterval(turnTimer);

    const alivePlayers = players.filter(p => p.alive);
    
    showScreen('result');

    if (alivePlayers.length === 1) {
      const winner = alivePlayers[0];
      resultTitle.textContent = '¡Victoria!';
      resultMessage.innerHTML = `<strong style="color:${winner.color}">${winner.name}</strong> es el último en pie.<br>Puntuación: ${winner.score}`;
    } else if (alivePlayers.length > 1) {
      resultTitle.textContent = '¡Empate!';
      resultMessage.textContent = 'Varios jugadores siguen en pie.';
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

  // ==================== EVENTOS ====================
  document.querySelectorAll('.player-selector button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-selector button').forEach(b => b.classList.remove('btn--selected'));
      btn.classList.add('btn--selected');
      selectedPlayerCount = parseInt(btn.dataset.players);
      buildControlsPreview();
    });
  });

  document.getElementById('start-btn').addEventListener('click', () => {
    startGame();
  });

  document.getElementById('restart-btn').addEventListener('click', () => {
    restartGame();
  });

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  function init() {
    buildControlsPreview();
    canvas.width = 780;
    canvas.height = 580;
    console.log('%c[Prickly Pyramids] Juego actualizado a modo TURNOS con brazo mecánico.', 'color:#854d0e');
  }

  init();
})();