(function() {
  'use strict';

  const CONFIG = {
    rows: 7, cols: 13, blockSize: 48, maxLives: 3, turnTime: 25,
    gravity: 420, instabilityChance: 0.35,
    players: [
      { id: 1, name: 'Jugador 1', color: '#f97316', keys: { left: 'ArrowLeft', right: 'ArrowRight', action: 'Space' } },
      { id: 2, name: 'Jugador 2', color: '#22c55e', keys: { left: 'KeyA', right: 'KeyD', action: 'KeyF' } },
      { id: 3, name: 'Jugador 3', color: '#3b82f6', keys: { left: 'KeyJ', right: 'KeyL', action: 'KeyK' } },
      { id: 4, name: 'Jugador 4', color: '#a855f7', keys: { left: 'KeyU', right: 'KeyO', action: 'KeyI' } }
    ],
    pieceTypes: ['I','T','L','O','S']
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

  let grid = [], players = [], particles = [], fallingBlocks = [];
  let running = false, currentPlayerIndex = 0, turnTimeLeft = CONFIG.turnTime;
  let turnTimer = null, armAngle = -0.65, armDirection = 1, currentPieceType = 'T';
  let screenShake = 0, keysDown = new Set();

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function getCurrentPlayer() { return players[currentPlayerIndex]; }

  function updateHUD() {
    hudEl.innerHTML = '';
    players.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = `hud-player ${!p.alive ? 'out' : ''}`;
      let hearts = '';
      for (let j = 0; j < CONFIG.maxLives; j++) hearts += `<div class="life ${j >= p.lives ? 'lost' : ''}"></div>`;
      div.innerHTML = `<span class="dot" style="background:${p.color}"></span><span><strong>${p.name}</strong></span><div class="lives">${hearts}</div>`;
      if (i === currentPlayerIndex && p.alive) div.style.boxShadow = `0 0 0 4px ${p.color}`;
      hudEl.appendChild(div);
    });
  }

  function updateTurnUI() {
    const p = getCurrentPlayer();
    if (currentTurnEl) currentTurnEl.innerHTML = `<span style="color:${p.color}">●</span> Turno de <strong>${p.name}</strong>`;
  }

  function updatePieceUI() {
    if (currentPieceEl) currentPieceEl.innerHTML = `<span style="font-size:2.4rem; font-weight:900; color:#f59e0b;">${currentPieceType}</span>`;
  }

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
      return { ...cfg, row: bottom, col: start + Math.floor(w / (count + 1)) * (i + 1), lives: CONFIG.maxLives, alive: true, score: 0 };
    });
  }

  function getBlock(row, col) {
    return (row >= 0 && row < CONFIG.rows && col >= 0 && col < CONFIG.cols) ? grid[row][col] : null;
  }

  function makeBlocksFall() {
    let fell = false;
    for (let r = CONFIG.rows - 2; r >= 0; r--) {
      for (let c = 0; c < CONFIG.cols; c++) {
        const b = grid[r][c];
        if (b && b.state === 'solid' && !getBlock(r+1, c)) {
          fallingBlocks.push({ x: 55 + c * CONFIG.blockSize, y: 145 + r * 42, vy: 90, life: 1.1, color: b.height > 0 ? '#ec4899' : '#854d0e' });
          grid[r][c] = null;
          fell = true;
        }
      }
    }
    if (fell) screenShake = 10;
  }

  function updateFalling(dt) {
    fallingBlocks = fallingBlocks.filter(b => {
      b.y += b.vy * dt; b.vy += CONFIG.gravity * dt; b.life -= dt;
      if (b.y > 500 || b.life <= 0) { spawnParticles(b.x + 18, b.y + 15, b.color, 6); return false; }
      return true;
    });
  }

  function checkPlayerFall() {
    players.forEach(p => {
      if (!p.alive) return;
      if (!getBlock(p.row, p.col)) {
        p.lives--;
        spawnParticles(55 + p.col * CONFIG.blockSize + 24, 145 + p.row * 42 + 20, p.color, 15);
        if (p.lives <= 0) { p.alive = false; checkWin(); }
        else {
          for (let r = CONFIG.rows-1; r >= 0; r--) for (let c = 0; c < CONFIG.cols; c++) if (getBlock(r,c)) { p.row = r; p.col = c; return; }
        }
      }
    });
  }

  function checkWin() {
    const alive = players.filter(p => p.alive);
    if (alive.length <= 1) {
      running = false;
      if (turnTimer) clearInterval(turnTimer);
      setTimeout(() => {
        showScreen('result');
        const w = alive[0];
        document.getElementById('result-title').textContent = w ? '¡Victoria!' : 'Empate';
        document.getElementById('result-message').innerHTML = w ? `${w.name} es el último en pie.` : 'Todos cayeron.';
      }, 1000);
    }
  }

  function updateArm() {
    if (!running) return;
    armAngle += armDirection * 0.028;
    if (armAngle > 0.85) armDirection = -1;
    if (armAngle < -0.85) armDirection = 1;
  }

  function dropPiece() {
    if (!running) return;
    const p = getCurrentPlayer(); if (!p.alive) return;
    const dropX = 140 + Math.sin(armAngle) * 215;
    const col = Math.max(0, Math.min(CONFIG.cols-1, Math.floor((dropX-55)/CONFIG.blockSize)));

    for (let r = CONFIG.rows-1; r >= 0; r--) {
      if (grid[r][col] && grid[r][col].state === 'solid') {
        grid[r][col].height = (grid[r][col].height || 0) + 1;
        spawnParticles(dropX, 145 + r * 42 + 15, p.color, 10);
        if (Math.random() < 0.4) makeBlocksFall();
        screenShake = 8;
        setTimeout(() => { if (running) { makeBlocksFall(); checkPlayerFall(); updateHUD(); nextTurn(); } }, 400);
        return;
      }
    }
  }

  function nextTurn() {
    let next = (currentPlayerIndex + 1) % players.length;
    let tries = 0;
    while (!players[next].alive && tries < players.length) { next = (next + 1) % players.length; tries++; }
    if (tries >= players.length) return checkWin();

    currentPlayerIndex = next;
    turnTimeLeft = CONFIG.turnTime;
    currentPieceType = CONFIG.pieceTypes[Math.floor(Math.random() * 5)];
    armAngle = -0.65; armDirection = 1;
    updateHUD(); updateTurnUI(); updatePieceUI();
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random()-0.5)*160, vy: (Math.random()-0.5)*130-30, life: 0.55 + Math.random()*0.4, color, size: 3 + Math.random()*3 });
  }

  function updateParticles(dt) {
    particles = particles.filter(p => { p.life -= dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 360*dt; return p.life > 0; });
  }

  function draw() {
    ctx.save();
    if (screenShake > 0) { ctx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake); screenShake *= 0.8; }
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // Fondo desierto
    const g = ctx.createLinearGradient(0,0,0,canvas.height);
    g.addColorStop(0,'#1e2937'); g.addColorStop(0.3,'#334155'); g.addColorStop(0.6,'#854d0e'); g.addColorStop(1,'#f59e0b');
    ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);

    // Pirámide
    const bs = CONFIG.blockSize;
    for (let r = 0; r < CONFIG.rows; r++) {
      const w = 2*r + 1; const start = Math.floor((CONFIG.cols-w)/2);
      for (let c = start; c < start+w; c++) {
        const b = grid[r][c]; if (!b) continue;
        const x = 55 + c*bs, y = 145 + r*42;
        ctx.fillStyle = b.height > 0 ? '#b45309' : '#854d0e';
        ctx.fillRect(x, y, bs-2, bs-2);
        ctx.strokeStyle = '#451a03'; ctx.lineWidth = 2; ctx.strokeRect(x, y, bs-2, bs-2);
        if (b.height > 0) { ctx.fillStyle = '#fefce8'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('𓂀', x + bs/2, y + bs/2 + 4); }
      }
    }

    // Brazo
    ctx.save(); ctx.translate(135, 155); ctx.rotate(armAngle);
    ctx.strokeStyle = '#451a03'; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,210); ctx.stroke();
    ctx.strokeStyle = '#fcd34d'; ctx.lineWidth = 7;
    for (let i=1; i<5; i++) { const yy = 210/5 * i; ctx.beginPath(); ctx.moveTo(-5,yy); ctx.lineTo(5,yy); ctx.stroke(); }
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-18,205); ctx.lineTo(0,235); ctx.lineTo(18,205); ctx.stroke();
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(0,238,10,0,Math.PI*2); ctx.fill();
    ctx.restore();

    // Jugadores
    players.forEach(p => {
      if (!p.alive) return;
      const x = 55 + p.col * bs + 24, y = 145 + p.row * 42 - 6;
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#451a03'; ctx.lineWidth = 2; ctx.stroke();
    });

    // Partículas y bloques cayendo
    particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill(); });
    ctx.globalAlpha = 1;
    fallingBlocks.forEach(b => { ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, 36, 32); });

    ctx.restore();
  }

  function gameLoop() {
    if (!running) return;
    updateArm(); updateFalling(0.016); updateParticles(0.016); draw();
    requestAnimationFrame(gameLoop);
  }

  function startTurnTimer() {
    if (turnTimer) clearInterval(turnTimer);
    turnTimer = setInterval(() => {
      if (!running) return;
      turnTimeLeft--; if (timerEl) timerEl.textContent = turnTimeLeft;
      if (turnTimeLeft <= 0) { clearInterval(turnTimer); nextTurn(); }
    }, 1000);
  }

  function startCountdown() {
    let c = 3;
    const iv = setInterval(() => {
      ctx.fillStyle = 'rgba(17,24,39,0.9)'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#fcd34d'; ctx.font = 'bold 120px Orbitron'; ctx.textAlign = 'center';
      if (c > 0) ctx.fillText(c, canvas.width/2, canvas.height/2 + 40);
      else { clearInterval(iv); ctx.fillText('START', canvas.width/2, canvas.height/2 + 40); setTimeout(() => { startTurnTimer(); gameLoop(); }, 700); }
      c--;
    }, 800);
  }

  function startGameFlow() {
    createGrid();
    initPlayers(3);
    particles = []; fallingBlocks = [];
    currentPlayerIndex = 0; turnTimeLeft = CONFIG.turnTime; armAngle = -0.65;
    currentPieceType = 'T'; screenShake = 0; running = false;

    showScreen('loading');

    setTimeout(() => {
      showScreen('game');
      updateHUD(); updateTurnUI(); updatePieceUI();
      if (timerEl) timerEl.textContent = turnTimeLeft;
      startCountdown();
      running = true;
    }, 1600);
  }

  function restart() {
    if (turnTimer) clearInterval(turnTimer);
    showScreen('menu'); running = false;
  }

  // Eventos
  document.querySelectorAll('.player-selector button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-selector button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.getElementById('start-btn').addEventListener('click', startGameFlow);
  document.getElementById('restart-btn').addEventListener('click', restart);

  window.addEventListener('keydown', e => {
    if (!running) return;
    const p = getCurrentPlayer(); if (!p || !p.alive) return;
    if (e.code === p.keys.left) armAngle -= 0.14;
    if (e.code === p.keys.right) armAngle += 0.14;
    if (e.code === p.keys.action || e.code === 'Space') { e.preventDefault(); dropPiece(); }
  });

  function init() {
    canvas.width = 860; canvas.height = 620;
    console.log('%c[Prickly Pyramids] Versión limpia y funcional lista.', 'color:#f59e0b');
  }

  init();
})();