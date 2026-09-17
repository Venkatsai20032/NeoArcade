// NEO-TIC: TACTICAL ARENA - MAIN CLIENT APPLICATION

(function() {
  const socket = io();

  // Avatar Emojis Map
  const AVATARS = {
    cyber_ninja: '🥷',
    mecha_core: '🤖',
    neon_valkyrie: '⚡',
    glitch_wraith: '👾',
    apex_hunter: '🐯',
    quantum_phoenix: '🦅'
  };

  // State
  let currentUser = null;
  let currentMatch = null;
  let selectedAvatar = 'cyber_ninja';
  let myChosenSymbol = 'X';
  let incomingChallengeTimer = null;
  let outgoingChallengeTimer = null;
  let countdownInterval = null;

  // DOM Elements
  const screens = {
    register: document.getElementById('screen-register'),
    lobby: document.getElementById('screen-lobby'),
    arena: document.getElementById('screen-arena')
  };

  const modals = {
    incomingChallenge: document.getElementById('modal-incoming-challenge'),
    waitingChallenge: document.getElementById('modal-waiting-challenge'),
    connectionSuccess: document.getElementById('modal-connection-success'),
    countdown: document.getElementById('overlay-countdown'),
    clash: document.getElementById('overlay-clash'),
    victory: document.getElementById('modal-victory'),
    wifi: document.getElementById('modal-wifi-info')
  };

  function showScreen(screenKey) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (screens[screenKey]) {
      screens[screenKey].classList.add('active');
    }
  }

  function showModal(modalKey) {
    if (modals[modalKey]) modals[modalKey].classList.remove('hidden');
  }

  function hideModal(modalKey) {
    if (modals[modalKey]) modals[modalKey].classList.add('hidden');
  }

  // 1. Fetch Network Info on Startup
  async function loadNetworkInfo() {
    try {
      const res = await fetch('/api/network-info');
      const data = await res.json();
      if (data.qrCodeDataUrl) {
        document.getElementById('wifi-qr-img').src = data.qrCodeDataUrl;
        document.getElementById('modal-wifi-qr-img').src = data.qrCodeDataUrl;
      }
      if (data.lanUrl) {
        document.getElementById('wifi-lan-url').value = data.lanUrl;
        document.getElementById('modal-wifi-url').value = data.lanUrl;
      }
    } catch (e) {
      console.warn('Network info fetch error:', e);
    }
  }

  // 2. Fetch Leaderboard & History
  async function loadLeaderboardAndHistory() {
    try {
      const [leadRes, histRes] = await Promise.all([
        fetch('/api/leaderboard'),
        fetch('/api/recent-matches')
      ]);
      const leaders = await leadRes.json();
      const history = await histRes.json();

      renderLeaderboard(leaders);
      renderHistory(history);
    } catch (e) {
      console.warn('Failed to load leaderboard/history:', e);
    }
  }

  function renderLeaderboard(leaders) {
    const container = document.getElementById('leaderboard-container');
    if (!leaders || leaders.length === 0) {
      container.innerHTML = '<div class="empty-state">No warriors registered yet.</div>';
      return;
    }
    container.innerHTML = leaders.map((u, i) => `
      <div class="leader-item">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="leader-rank">#${i + 1}</span>
          <span style="font-size:20px;">${AVATARS[u.avatar] || '🥷'}</span>
          <strong style="color:#fff;font-family:var(--font-display);font-size:13px;">${escapeHtml(u.username)}</strong>
        </div>
        <div style="font-family:var(--font-hud);font-size:13px;display:flex;gap:12px;">
          <span style="color:var(--neon-gold);">${u.rating} PTS</span>
          <span style="color:var(--neon-green);">${u.wins}W</span>
          <span style="color:var(--neon-magenta);">${u.losses}L</span>
        </div>
      </div>
    `).join('');
  }

  function renderHistory(matches) {
    const container = document.getElementById('history-container');
    if (!matches || matches.length === 0) {
      container.innerHTML = '<div class="empty-state">No recent tournament matches.</div>';
      return;
    }
    container.innerHTML = matches.map(m => `
      <div class="history-item">
        <div>
          <div style="font-family:var(--font-display);font-size:13px;color:#fff;">
            ${escapeHtml(m.player1_name)} vs ${escapeHtml(m.player2_name)}
          </div>
          <div style="font-family:var(--font-hud);font-size:11px;color:#94a3b8;">
            Winner: <strong style="color:var(--neon-gold);">${escapeHtml(m.winner_name || 'Draw')}</strong>
            ${m.clashes_count > 0 ? `• ${m.clashes_count} Clashes` : ''}
          </div>
        </div>
        <div style="font-family:var(--font-display);font-size:16px;font-weight:800;color:var(--neon-cyan);">
          ${m.p1_score} - ${m.p2_score}
        </div>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 3. Avatar Selection
  const avatarOptions = document.querySelectorAll('.avatar-option');
  avatarOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      window.soundEngine.playClick();
      avatarOptions.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAvatar = btn.dataset.avatar;
    });
  });

  // 4. Registration Submit
  const regForm = document.getElementById('register-form');
  regForm.addEventListener('submit', (e) => {
    e.preventDefault();
    window.soundEngine.playClick();
    const username = document.getElementById('reg-username').value.trim();
    if (!username) return;

    socket.emit('user:register', {
      username,
      avatar: selectedAvatar
    });
  });

  socket.on('user:registered', ({ user }) => {
    currentUser = user;
    localStorage.setItem('neo_tic_user_id', user.id);
    localStorage.setItem('neo_tic_username', user.username);
    localStorage.setItem('neo_tic_avatar', user.avatar);

    updateUserProfileUI();
    showScreen('lobby');
    loadLeaderboardAndHistory();
  });

  function updateUserProfileUI() {
    if (!currentUser) return;
    document.getElementById('user-header-pill').classList.remove('hidden');
    document.getElementById('header-avatar').textContent = AVATARS[currentUser.avatar] || '🥷';
    document.getElementById('header-username').textContent = currentUser.username;

    document.getElementById('lobby-profile-avatar').textContent = AVATARS[currentUser.avatar] || '🥷';
    document.getElementById('lobby-profile-name').textContent = currentUser.username;
    document.getElementById('lobby-profile-rating').textContent = currentUser.rating;
    document.getElementById('lobby-stat-wins').textContent = currentUser.wins;
    document.getElementById('lobby-stat-losses').textContent = currentUser.losses;
    document.getElementById('lobby-stat-draws').textContent = currentUser.draws;

    const total = currentUser.wins + currentUser.losses;
    const rate = total > 0 ? Math.round((currentUser.wins / total) * 100) : 0;
    document.getElementById('lobby-stat-rate').textContent = rate + '%';

    const miniChip = document.getElementById('mini-stats-chip');
    if (miniChip) {
      miniChip.textContent = `⭐ ${currentUser.rating} • ${currentUser.wins}W - ${currentUser.losses}L (${rate}%)`;
    }
  }

  // Toast Notification System
  function showToast(message, actionText = null, onAction = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'cyber-toast';
    toast.innerHTML = `
      <div class="toast-content">
        <span class="pulse-dot"></span>
        <span class="toast-msg">${escapeHtml(message)}</span>
      </div>
      ${actionText ? `<button class="cyber-btn sm neon-green toast-action-btn">${escapeHtml(actionText)}</button>` : ''}
      <button class="toast-close-btn">✕</button>
    `;

    if (actionText && onAction) {
      toast.querySelector('.toast-action-btn').addEventListener('click', () => {
        window.soundEngine.playClick();
        onAction();
        toast.remove();
      });
    }

    toast.querySelector('.toast-close-btn').addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 9000);
  }

  // Socket Connection & Automatic Registration
  function sendRegistration() {
    const cachedId = localStorage.getItem('neo_tic_user_id');
    const cachedName = localStorage.getItem('neo_tic_username');
    const cachedAvatar = localStorage.getItem('neo_tic_avatar') || 'cyber_ninja';

    if (cachedName) {
      document.getElementById('reg-username').value = cachedName;
      selectedAvatar = cachedAvatar;
      avatarOptions.forEach(b => {
        b.classList.toggle('selected', b.dataset.avatar === cachedAvatar);
      });

      socket.emit('user:register', {
        userId: cachedId,
        username: cachedName,
        avatar: cachedAvatar
      });
    }
  }

  // Auto-register on socket connect / reconnect
  socket.on('connect', () => {
    console.log('[SOCKET] Connected to arena server:', socket.id);
    sendRegistration();
  });

  window.addEventListener('DOMContentLoaded', () => {
    loadNetworkInfo();
    sendRegistration();

    // Minimizable Stats Banner
    const statsBanner = document.getElementById('lobby-stats-banner');
    const minStatsBtn = document.getElementById('btn-minimize-stats');
    const minStatsIcon = document.getElementById('minimize-stats-icon');
    const miniStatsChip = document.getElementById('mini-stats-chip');

    const isStatsMinimized = localStorage.getItem('neo_tic_stats_minimized') === 'true';
    if (isStatsMinimized && statsBanner) {
      statsBanner.classList.add('minimized');
      if (minStatsIcon) minStatsIcon.textContent = '▼';
      if (miniStatsChip) miniStatsChip.classList.remove('hidden');
    }

    if (minStatsBtn && statsBanner) {
      minStatsBtn.addEventListener('click', () => {
        window.soundEngine.playClick();
        const minimized = statsBanner.classList.toggle('minimized');
        if (minStatsIcon) minStatsIcon.textContent = minimized ? '▼' : '▲';
        if (miniStatsChip) miniStatsChip.classList.toggle('hidden', !minimized);
        localStorage.setItem('neo_tic_stats_minimized', minimized);
      });
    }

    // Minimizable Side Panel
    const lobbyGrid = document.querySelector('.lobby-grid');
    const sidePanel = document.getElementById('lobby-side-panel');
    const minSideBtn = document.getElementById('btn-minimize-side');
    const minSideIcon = document.getElementById('minimize-side-icon');

    const isSideCollapsed = localStorage.getItem('neo_tic_side_collapsed') === 'true';
    if (isSideCollapsed && lobbyGrid && sidePanel) {
      lobbyGrid.classList.add('side-collapsed');
      sidePanel.classList.add('collapsed');
      if (minSideIcon) minSideIcon.textContent = '◀';
    }

    if (minSideBtn && lobbyGrid && sidePanel) {
      minSideBtn.addEventListener('click', () => {
        window.soundEngine.playClick();
        const collapsed = sidePanel.classList.toggle('collapsed');
        lobbyGrid.classList.toggle('side-collapsed', collapsed);
        if (minSideIcon) minSideIcon.textContent = collapsed ? '◀' : '⛶';
        localStorage.setItem('neo_tic_side_collapsed', collapsed);
      });
    }

    // Fullscreen / Scalable Arena Mode Toggle
    const fullscreenBtn = document.getElementById('btn-arena-fullscreen');
    const appContainer = document.querySelector('.app-container');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        window.soundEngine.playClick();
        if (!document.fullscreenElement) {
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
          if (appContainer) appContainer.classList.add('arena-fullscreen-active');
          fullscreenBtn.textContent = '✕';
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
          if (appContainer) appContainer.classList.remove('arena-fullscreen-active');
          fullscreenBtn.textContent = '⛶';
        }
      });
    }

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && appContainer) {
        appContainer.classList.remove('arena-fullscreen-active');
        if (fullscreenBtn) fullscreenBtn.textContent = '⛶';
      }
    });

    // Re-scan Wi-Fi button
    const refreshBtn = document.getElementById('btn-refresh-lobby');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        window.soundEngine.playClick();
        refreshBtn.textContent = '🔄 Scanning...';
        socket.emit('lobby:refresh');
        setTimeout(() => {
          refreshBtn.textContent = '🔄 Re-scan';
        }, 800);
      });
    }

    // Quick Match button
    const quickMatchBtn = document.getElementById('btn-quick-match');
    if (quickMatchBtn) {
      quickMatchBtn.addEventListener('click', () => {
        window.soundEngine.playClick();
        socket.emit('match:quick_match');
      });
    }
  });

  // 5. Lobby List Updates
  let lastKnownOpponentsCount = 0;

  socket.on('lobby:update', (players) => {
    const listEl = document.getElementById('players-list');
    const countEl = document.getElementById('online-count');
    const quickBanner = document.getElementById('quick-match-banner');
    const quickText = document.getElementById('quick-match-text');

    countEl.textContent = `${players.length} ONLINE`;

    if (!currentUser) return;

    const otherPlayers = players.filter(p => p.id !== currentUser.id);
    const availableOpponents = otherPlayers.filter(p => p.status === 'available');

    // Detect new opponent joining lobby -> Play alert chime & show toast
    if (availableOpponents.length > lastKnownOpponentsCount && otherPlayers.length > 0) {
      const newestOpponent = availableOpponents[availableOpponents.length - 1];
      window.soundEngine.playChallengeAlert();
      showToast(
        `⚡ ${newestOpponent.username} is ONLINE and ready to play!`,
        '⚔️ PLAY NOW',
        () => {
          socket.emit('challenge:send', { targetUserId: newestOpponent.id });
        }
      );
    }
    lastKnownOpponentsCount = availableOpponents.length;

    // Quick Match Hero Banner
    if (availableOpponents.length > 0 && quickBanner) {
      quickBanner.classList.remove('hidden');
      const opp = availableOpponents[0];
      quickText.innerHTML = `<strong>${availableOpponents.length}</strong> Opponent(s) Available on Wi-Fi: <strong style="color:var(--neon-green);">${escapeHtml(opp.username)}</strong>`;
    } else if (quickBanner) {
      quickBanner.classList.add('hidden');
    }

    // Render Players List
    if (players.length <= 1) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div style="font-size:28px;margin-bottom:8px;">📡</div>
          <strong style="color:#fff;font-size:15px;">You are currently the only player in the arena lobby.</strong><br><br>
          <span style="font-size:13px;color:var(--neon-cyan);">
            To connect & play: Open <strong>${document.getElementById('wifi-lan-url')?.value || 'http://192.168.1.5:3000'}</strong> on your phone or scan the Wi-Fi QR code!
          </span>
          <div style="margin-top:14px;">
            <button class="cyber-btn sm neon-blue" onclick="document.getElementById('wifi-info-btn').click()">
              📶 View QR Code & Direct Link
            </button>
          </div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = players.map(p => {
      const isSelf = p.id === currentUser.id;
      const statusClass = `status-${p.status}`;
      const statusLabel = p.status === 'available' ? 'READY TO PLAY' : (p.status === 'in_battle' ? 'IN BATTLE' : 'IN CHALLENGE');
      
      let actionBtn = '';
      if (!isSelf) {
        if (p.status === 'available') {
          actionBtn = `<button class="cyber-btn sm neon-green btn-challenge btn-connect-play" data-user-id="${p.id}">⚔️ CONNECT & PLAY</button>`;
        } else {
          actionBtn = `<button class="cyber-btn sm" disabled style="opacity:0.4;cursor:not-allowed;">IN BATTLE</button>`;
        }
      } else {
        actionBtn = `<span class="badge-you">(YOU - ONLINE)</span>`;
      }

      return `
        <div class="player-row-card ${!isSelf && p.status === 'available' ? 'ready-opponent-highlight' : ''}">
          <div class="player-row-meta">
            <span class="player-row-avatar">${AVATARS[p.avatar] || '🥷'}</span>
            <div>
              <div class="player-row-name">${escapeHtml(p.username)} ${isSelf ? '<span style="font-size:11px;color:var(--neon-cyan);">(This Device)</span>' : ''}</div>
              <div class="player-row-sub">
                <span>⭐ ${p.rating} PTS</span>
                <span>🏆 ${p.wins}W</span>
                <span class="status-pill ${statusClass}">${statusLabel}</span>
              </div>
            </div>
          </div>
          <div>${actionBtn}</div>
        </div>
      `;
    }).join('');

    // Attach challenge click handlers
    listEl.querySelectorAll('.btn-challenge').forEach(btn => {
      btn.addEventListener('click', () => {
        window.soundEngine.playClick();
        const targetUserId = btn.dataset.userId;
        btn.textContent = 'TRANSMITTING...';
        btn.disabled = true;
        socket.emit('challenge:send', { targetUserId });
      });
    });
  });

  // 6. Challenge Sent & Waiting Dialog (30s timeout)
  socket.on('challenge:sent', ({ challengeId, target, timeoutSeconds }) => {
    document.getElementById('waiting-target-name').textContent = target.username;
    showModal('waitingChallenge');

    let remaining = timeoutSeconds || 30;
    const timerText = document.getElementById('waiting-timer-text');
    timerText.textContent = `Expires in ${remaining}s`;

    clearInterval(outgoingChallengeTimer);
    outgoingChallengeTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(outgoingChallengeTimer);
        hideModal('waitingChallenge');
      } else {
        timerText.textContent = `Expires in ${remaining}s`;
      }
    }, 1000);
  });

  document.getElementById('btn-cancel-challenge').addEventListener('click', () => {
    window.soundEngine.playClick();
    clearInterval(outgoingChallengeTimer);
    hideModal('waitingChallenge');
  });

  // 7. Incoming Challenge (30s dial)
  let currentIncomingChallengeId = null;

  socket.on('challenge:incoming', ({ challengeId, challenger, timeoutSeconds }) => {
    currentIncomingChallengeId = challengeId;
    window.soundEngine.playChallengeAlert();

    document.getElementById('invite-challenger-avatar').textContent = AVATARS[challenger.avatar] || '🥷';
    document.getElementById('invite-challenger-name').textContent = challenger.username;

    showModal('incomingChallenge');

    let timeLeft = timeoutSeconds || 30;
    const totalTime = timeLeft;
    const timerText = document.getElementById('invite-timer-text');
    const ring = document.getElementById('invite-timer-ring');
    const circumference = 2 * Math.PI * 42; // r=42 -> 263.89

    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = 0;
    timerText.textContent = `${timeLeft}s`;

    clearInterval(incomingChallengeTimer);
    incomingChallengeTimer = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        clearInterval(incomingChallengeTimer);
        hideModal('incomingChallenge');
      } else {
        timerText.textContent = `${timeLeft}s`;
        const offset = circumference - (timeLeft / totalTime) * circumference;
        ring.style.strokeDashoffset = offset;
      }
    }, 1000);
  });

  document.getElementById('btn-accept-challenge').addEventListener('click', () => {
    window.soundEngine.playAccept();
    clearInterval(incomingChallengeTimer);
    hideModal('incomingChallenge');
    if (currentIncomingChallengeId) {
      socket.emit('challenge:respond', {
        challengeId: currentIncomingChallengeId,
        accepted: true
      });
    }
  });

  document.getElementById('btn-decline-challenge').addEventListener('click', () => {
    window.soundEngine.playClick();
    clearInterval(incomingChallengeTimer);
    hideModal('incomingChallenge');
    if (currentIncomingChallengeId) {
      socket.emit('challenge:respond', {
        challengeId: currentIncomingChallengeId,
        accepted: false
      });
    }
  });

  socket.on('challenge:declined', ({ message }) => {
    clearInterval(outgoingChallengeTimer);
    hideModal('waitingChallenge');
    alert(message || 'Challenge declined.');
  });

  socket.on('challenge:timeout', ({ message }) => {
    clearInterval(incomingChallengeTimer);
    clearInterval(outgoingChallengeTimer);
    hideModal('incomingChallenge');
    hideModal('waitingChallenge');
  });

  // 8. Match Connected & Setup
  socket.on('match:connected', ({ matchId, message, p1, p2, hostId }) => {
    clearInterval(incomingChallengeTimer);
    clearInterval(outgoingChallengeTimer);
    hideModal('incomingChallenge');
    hideModal('waitingChallenge');

    window.soundEngine.playAccept();
    showModal('connectionSuccess');

    setTimeout(() => {
      hideModal('connectionSuccess');
      setupMatchArena(matchId, p1, p2, hostId);
    }, 1600);
  });

  function setupMatchArena(matchId, p1, p2, hostId) {
    currentMatch = {
      matchId,
      p1,
      p2,
      hostId,
      currentRound: 1,
      scores: { [p1.id]: 0, [p2.id]: 0 },
      board: Array(9).fill(null),
      currentTurn: p1.id
    };

    // Render Left Player 1 HUD
    document.getElementById('hud-p1-avatar').textContent = AVATARS[p1.avatar] || '🥷';
    document.getElementById('hud-p1-name').textContent = p1.username;
    document.getElementById('hud-p1-role').textContent = p1.id === hostId ? 'HOST' : 'CHALLENGER';
    document.getElementById('hud-p1-score').textContent = '0';
    document.getElementById('hud-p1-symbol').textContent = p1.symbol || 'X';

    // Render Right Player 2 HUD
    document.getElementById('hud-p2-avatar').textContent = AVATARS[p2.avatar] || '🤖';
    document.getElementById('hud-p2-name').textContent = p2.username;
    document.getElementById('hud-p2-role').textContent = p2.id === hostId ? 'HOST' : 'CHALLENGER';
    document.getElementById('hud-p2-score').textContent = '0';
    document.getElementById('hud-p2-symbol').textContent = p2.symbol || 'O';

    // Scores in header
    document.getElementById('header-p1-score').textContent = '0';
    document.getElementById('header-p2-score').textContent = '0';

    // Reset Round Tracker
    document.getElementById('arena-round-badge').textContent = 'ROUND 1';
    resetRoundDots();

    // Clear board cells
    clearBoardCells();
    hideStrikeLine();

    // Show Arena Screen
    showScreen('arena');

    // Configure Bottom Dock
    const isHost = currentUser.id === hostId;
    const pickerDock = document.getElementById('dock-symbol-picker');
    const gameplayDock = document.getElementById('dock-gameplay');

    pickerDock.classList.remove('hidden');
    gameplayDock.classList.add('hidden');

    if (isHost) {
      document.getElementById('picker-instruction-text').textContent = 'HOST: CHOOSE COMBAT SYMBOL & ENGAGE:';
      document.getElementById('host-symbol-buttons').style.display = 'flex';
      document.getElementById('btn-lock-symbol').style.display = 'inline-flex';
    } else {
      document.getElementById('picker-instruction-text').textContent = 'AWAITING HOST SYMBOL SELECTION & ENGAGEMENT...';
      document.getElementById('host-symbol-buttons').style.display = 'none';
      document.getElementById('btn-lock-symbol').style.display = 'none';
    }
  }

  // 9. Host Symbol Selection
  const symbolButtons = document.querySelectorAll('.symbol-btn');
  symbolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      window.soundEngine.playClick();
      symbolButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      myChosenSymbol = btn.dataset.symbol;

      if (currentMatch) {
        socket.emit('match:choose_symbol', {
          matchId: currentMatch.matchId,
          chosenSymbol: myChosenSymbol
        });
      }
    });
  });

  socket.on('match:symbols_assigned', ({ p1, p2, startingUserId }) => {
    if (!currentMatch) return;
    currentMatch.p1 = p1;
    currentMatch.p2 = p2;
    currentMatch.currentTurn = startingUserId;

    document.getElementById('hud-p1-symbol').textContent = p1.symbol;
    document.getElementById('hud-p2-symbol').textContent = p2.symbol;
  });

  document.getElementById('btn-lock-symbol').addEventListener('click', () => {
    window.soundEngine.playClick();
    if (!currentMatch) return;
    socket.emit('match:start_countdown', {
      matchId: currentMatch.matchId
    });
  });

  // 10. 5-Second Countdown
  socket.on('match:countdown_start', ({ durationSeconds, roundName }) => {
    document.getElementById('countdown-round-name').textContent = `${roundName} COMMENCING`;
    showModal('countdown');

    let count = durationSeconds || 5;
    const numEl = document.getElementById('countdown-num');
    numEl.textContent = count;
    window.soundEngine.playCountdownTick(count);

    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(countdownInterval);
        numEl.textContent = 'ENGAGE!';
        window.soundEngine.playGong();
        setTimeout(() => {
          hideModal('countdown');
        }, 700);
      } else {
        numEl.textContent = count;
        window.soundEngine.playCountdownTick(count);
      }
    }, 1000);
  });

  // 11. Round Start
  socket.on('game:round_start', ({ matchId, currentRound, roundName, board, scores, currentTurn, p1, p2, isClashReplay }) => {
    hideModal('clash');
    hideStrikeLine();
    clearBoardCells();

    currentMatch.currentRound = currentRound;
    currentMatch.roundName = roundName;
    currentMatch.board = board;
    currentMatch.scores = scores;
    currentMatch.currentTurn = currentTurn;
    currentMatch.p1 = p1;
    currentMatch.p2 = p2;

    // Switch Bottom Dock to Gameplay
    document.getElementById('dock-symbol-picker').classList.add('hidden');
    document.getElementById('dock-gameplay').classList.remove('hidden');

    // Update Round Headers
    document.getElementById('arena-round-badge').textContent = roundName;
    updateRoundTrackerDots(currentRound);

    // Update HUD Scores
    document.getElementById('hud-p1-score').textContent = scores[p1.id] || 0;
    document.getElementById('hud-p2-score').textContent = scores[p2.id] || 0;
    document.getElementById('header-p1-score').textContent = scores[p1.id] || 0;
    document.getElementById('header-p2-score').textContent = scores[p2.id] || 0;

    // Update Turn Indicators
    updateTurnHUD(currentTurn);
  });

  function updateTurnHUD(currentTurn) {
    if (!currentMatch || !currentUser) return;
    const p1Card = document.getElementById('hud-p1');
    const p2Card = document.getElementById('hud-p2');
    const p1TurnBadge = document.getElementById('hud-p1-turn-indicator');
    const p2TurnBadge = document.getElementById('hud-p2-turn-indicator');

    const isP1Turn = currentTurn === currentMatch.p1.id;
    const isP2Turn = currentTurn === currentMatch.p2.id;
    const isMyTurn = currentTurn === currentUser.id;

    p1Card.classList.toggle('active-turn', isP1Turn);
    p2Card.classList.toggle('active-turn', isP2Turn);

    p1TurnBadge.textContent = isP1Turn ? 'STRIKING' : 'WAITING';
    p2TurnBadge.textContent = isP2Turn ? 'STRIKING' : 'WAITING';

    const mySymbol = currentUser.id === currentMatch.p1.id ? currentMatch.p1.symbol : currentMatch.p2.symbol;
    document.getElementById('dock-my-symbol').textContent = mySymbol;
    document.getElementById('dock-my-symbol').className = `turn-symbol-preview ${mySymbol === 'X' ? 'symbol-x' : 'symbol-o'}`;

    const headline = document.getElementById('dock-turn-message');
    const sub = document.getElementById('dock-turn-sub');

    if (isMyTurn) {
      headline.textContent = '⚡ YOUR TURN - ENGAGE TARGET';
      headline.style.color = 'var(--neon-green)';
      sub.textContent = 'Click an available grid slot to strike.';
    } else {
      headline.textContent = '⏳ OPPONENT ENGAGING...';
      headline.style.color = '#94a3b8';
      sub.textContent = 'Analyzing incoming tactical maneuvers.';
    }
  }

  // 12. Grid Cell Click
  const gridCells = document.querySelectorAll('.grid-cell');
  gridCells.forEach(cell => {
    cell.addEventListener('click', (e) => {
      if (!currentMatch || !currentUser) return;
      if (currentMatch.currentTurn !== currentUser.id) return;

      const index = parseInt(cell.dataset.index, 10);
      if (cell.classList.contains('claimed')) return;

      socket.emit('game:make_move', {
        matchId: currentMatch.matchId,
        index
      });
    });
  });

  // 13. Move Executed
  socket.on('game:move_success', ({ index, symbol, board, nextTurn }) => {
    if (!currentMatch) return;
    currentMatch.board = board;
    const cell = document.getElementById(`cell-${index}`);
    if (cell) {
      cell.textContent = symbol;
      cell.classList.add('claimed', symbol === 'X' ? 'cell-x' : 'cell-o');

      // Particle FX burst
      const rect = cell.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const color = symbol === 'X' ? '#00f0ff' : '#ff0055';
      if (window.fxCanvas) {
        window.fxCanvas.emitBurst(cx, cy, color, 24);
      }

      // Audio
      if (symbol === 'X') {
        window.soundEngine.playMoveX();
      } else {
        window.soundEngine.playMoveO();
      }
    }

    if (nextTurn) {
      currentMatch.currentTurn = nextTurn;
      updateTurnHUD(nextTurn);
    }
  });

  // 14. Round Won
  socket.on('game:round_won', ({ roundNumber, roundName, winnerId, winnerName, winningCombo, scores }) => {
    if (!currentMatch) return;
    currentMatch.scores = scores;

    // Highlight winning cells
    if (winningCombo) {
      winningCombo.forEach(idx => {
        const c = document.getElementById(`cell-${idx}`);
        if (c) c.classList.add('winning-cell');
      });
      drawStrikeLine(winningCombo);
    }

    // Play Victory Chord
    window.soundEngine.playRoundWin();

    // Mark round dot
    const dot = document.getElementById(`dot-round-${roundNumber}`);
    if (dot) {
      dot.classList.add(winnerId === currentMatch.p1.id ? 'won-p1' : 'won-p2');
    }

    // Update Scores
    document.getElementById('hud-p1-score').textContent = scores[currentMatch.p1.id] || 0;
    document.getElementById('hud-p2-score').textContent = scores[currentMatch.p2.id] || 0;
    document.getElementById('header-p1-score').textContent = scores[currentMatch.p1.id] || 0;
    document.getElementById('header-p2-score').textContent = scores[currentMatch.p2.id] || 0;

    // Flash status
    document.getElementById('dock-turn-message').textContent = `ROUND WON BY ${winnerName.toUpperCase()}!`;
    document.getElementById('dock-turn-message').style.color = 'var(--neon-gold)';
  });

  // 15. Clash / Draw Replay Banner
  socket.on('game:clash_replay', ({ roundNumber, roundName, message }) => {
    window.soundEngine.playClash();
    showModal('clash');
  });

  // 16. Tournament Concluded
  socket.on('game:tournament_concluded', ({ winnerId, winnerName, scores, p1, p2, roundsPlayed, clashesCount, newAchievements }) => {
    if (window.fxCanvas) {
      window.fxCanvas.emitVictoryConfetti();
    }
    window.soundEngine.playMatchVictory();

    document.getElementById('victory-winner-name').textContent = winnerId ? `${winnerName.toUpperCase()} VICTORIOUS!` : 'TACTICAL STALEMATE';
    document.getElementById('victory-congrats-sub').textContent = winnerId ? 'Superior combat tactics and strategic dominance demonstrated in the Arena.' : 'Both warriors fought to an honorable draw.';

    document.getElementById('victory-p1-name').textContent = p1.username;
    document.getElementById('victory-p2-name').textContent = p2.username;
    document.getElementById('victory-p1-score').textContent = scores[p1.id] || 0;
    document.getElementById('victory-p2-score').textContent = scores[p2.id] || 0;

    document.getElementById('victory-rounds-count').textContent = roundsPlayed;
    document.getElementById('victory-clashes-count').textContent = clashesCount || 0;

    // Render Unlocked Badges
    const badgeBox = document.getElementById('victory-achievements-box');
    const badgeList = document.getElementById('victory-badges-list');
    const myBadges = (currentUser.id === p1.id ? newAchievements.p1 : newAchievements.p2) || [];

    if (myBadges.length > 0) {
      badgeBox.classList.remove('hidden');
      badgeList.innerHTML = myBadges.map(b => `
        <span class="badge-chip">
          <span>${b.icon}</span>
          <span>${escapeHtml(b.title)}</span>
        </span>
      `).join('');
    } else {
      badgeBox.classList.add('hidden');
    }

    // Refresh user profile with updated stats
    if (currentUser.id === p1.id) currentUser = p1;
    if (currentUser.id === p2.id) currentUser = p2;
    updateUserProfileUI();
    loadLeaderboardAndHistory();

    showModal('victory');
  });

  // 17. Rematch & Exit Handlers
  document.getElementById('btn-request-rematch').addEventListener('click', () => {
    window.soundEngine.playClick();
    if (!currentMatch) return;
    socket.emit('game:rematch_request', { matchId: currentMatch.matchId });
    document.getElementById('btn-request-rematch').textContent = '⏳ WAITING FOR OPPONENT...';
  });

  socket.on('game:rematch_requested_by_opponent', () => {
    const btn = document.getElementById('btn-request-rematch');
    btn.textContent = '⚔️ OPPONENT WANTS REMATCH! (CLICK TO ACCEPT)';
    btn.classList.add('neon-green');
  });

  socket.on('game:rematch_agreed', ({ matchId, p1, p2, hostId }) => {
    hideModal('victory');
    setupMatchArena(matchId, p1, p2, hostId);
  });

  document.getElementById('btn-return-lobby').addEventListener('click', () => {
    window.soundEngine.playClick();
    if (currentMatch) {
      socket.emit('game:exit_to_lobby', { matchId: currentMatch.matchId });
    }
    hideModal('victory');
    showScreen('lobby');
  });

  document.getElementById('btn-leave-arena').addEventListener('click', () => {
    if (confirm('Leave current combat arena and return to lobby?')) {
      if (currentMatch) {
        socket.emit('game:exit_to_lobby', { matchId: currentMatch.matchId });
      }
      showScreen('lobby');
    }
  });

  document.getElementById('btn-surrender').addEventListener('click', () => {
    if (confirm('Surrender this arena match to your opponent?')) {
      if (currentMatch) {
        socket.emit('game:resign', { matchId: currentMatch.matchId });
      }
    }
  });

  socket.on('game:player_disconnected', ({ message }) => {
    alert(message || 'Opponent disconnected from arena.');
    hideModal('victory');
    showScreen('lobby');
  });

  // Strike line drawing helper
  function drawStrikeLine(combo) {
    const svgLine = document.getElementById('strike-line');
    const coords = {
      0: { x: 16.6, y: 16.6 }, 1: { x: 50, y: 16.6 }, 2: { x: 83.3, y: 16.6 },
      3: { x: 16.6, y: 50 },   4: { x: 50, y: 50 },   5: { x: 83.3, y: 50 },
      6: { x: 16.6, y: 83.3 }, 7: { x: 50, y: 83.3 }, 8: { x: 83.3, y: 83.3 }
    };
    const start = coords[combo[0]];
    const end = coords[combo[2]];

    svgLine.setAttribute('x1', start.x);
    svgLine.setAttribute('y1', start.y);
    svgLine.setAttribute('x2', end.x);
    svgLine.setAttribute('y2', end.y);
    svgLine.classList.add('visible');
  }

  function hideStrikeLine() {
    const svgLine = document.getElementById('strike-line');
    if (svgLine) svgLine.classList.remove('visible');
  }

  function clearBoardCells() {
    gridCells.forEach(c => {
      c.textContent = '';
      c.className = 'grid-cell';
    });
  }

  function resetRoundDots() {
    ['1', '2', '3'].forEach(num => {
      const dot = document.getElementById(`dot-round-${num}`);
      if (dot) {
        dot.className = 'round-dot';
      }
    });
    const d1 = document.getElementById('dot-round-1');
    if (d1) d1.classList.add('active');
  }

  function updateRoundTrackerDots(roundNum) {
    ['1', '2', '3'].forEach((num, idx) => {
      const dot = document.getElementById(`dot-round-${num}`);
      if (dot) {
        if (idx + 1 === roundNum) {
          dot.classList.add('active');
        }
      }
    });
  }

  // Header Wi-Fi Info Modal
  document.getElementById('wifi-info-btn').addEventListener('click', () => {
    window.soundEngine.playClick();
    showModal('wifi');
  });

  document.getElementById('btn-close-wifi').addEventListener('click', () => {
    hideModal('wifi');
  });

  // Copy Buttons
  function copyText(inputId, btnId) {
    const input = document.getElementById(inputId);
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById(btnId);
      const prev = btn.textContent;
      btn.textContent = 'COPIED!';
      setTimeout(() => { btn.textContent = prev; }, 2000);
    });
  }

  document.getElementById('btn-copy-wifi').addEventListener('click', () => copyText('wifi-lan-url', 'btn-copy-wifi'));
  document.getElementById('btn-modal-copy-wifi').addEventListener('click', () => copyText('modal-wifi-url', 'btn-modal-copy-wifi'));

  // Sound Toggle
  const soundBtn = document.getElementById('sound-toggle-btn');
  soundBtn.addEventListener('click', () => {
    const isMuted = window.soundEngine.toggleMute();
    soundBtn.textContent = isMuted ? '🔇' : '🔊';
  });

  // Tab switching in lobby side panel
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      window.soundEngine.playClick();
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.dataset.tab;
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

})();
