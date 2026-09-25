// NEO-TIC: TACTICAL ARENA - MAIN CLIENT APPLICATION
// Supports Online Wi-Fi Mode, Static/Offline AI Combat, Local Duel, and P2P WebRTC

(function() {
  const isStaticHost = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';
  let socket = null;
  try {
    if (typeof io !== 'undefined') {
      socket = io({
        autoConnect: !isStaticHost,
        reconnectionAttempts: 3,
        timeout: 4000
      });
    }
  } catch (e) {
    console.warn('Socket connection skipped in static mode:', e);
  }

  // Safe fallback dummy socket if io is not loaded or null
  if (!socket) {
    socket = {
      connected: false,
      on: () => {},
      off: () => {},
      emit: () => {}
    };
  }

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
    wifi: document.getElementById('modal-wifi-info'),
    p2pRoom: document.getElementById('modal-p2p-room')
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

  let currentLanUrl = '';
  let detectedNetworkIps = [];

  function renderQrToElement(containerId, text, size = 200) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (typeof window.QRCode !== 'undefined') {
      try {
        new window.QRCode(container, {
          text: text,
          width: size,
          height: size,
          colorDark: '#050811',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });

        const imgOrCanvas = container.querySelector('img, canvas');
        if (imgOrCanvas) {
          imgOrCanvas.style.display = 'block';
          imgOrCanvas.style.margin = '0 auto';
          imgOrCanvas.style.maxWidth = '100%';
          imgOrCanvas.style.height = 'auto';
          imgOrCanvas.style.borderRadius = '4px';
        }
        return;
      } catch (err) {
        console.warn('Local QRCode render error, falling back:', err);
      }
    }

    // High-reliability online/image fallback
    const img = document.createElement('img');
    img.alt = 'Wi-Fi QR Code';
    img.style.display = 'block';
    img.style.margin = '0 auto';
    img.style.maxWidth = '100%';
    img.style.borderRadius = '4px';
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=6&data=${encodeURIComponent(text)}`;
    img.onerror = () => {
      container.innerHTML = `
        <div class="qr-offline-placeholder">
          <span style="font-size:28px;">📶</span>
          <div style="font-family:var(--font-hud);font-size:12px;color:#050811;margin-top:6px;font-weight:700;">
            LAN URL:<br>
            <span style="color:#0284c7;word-break:break-all;">${escapeHtml(text)}</span>
          </div>
        </div>
      `;
    };
    container.appendChild(img);
  }

  function updateNetworkDisplay(url, qrDataUrl = null, allIps = []) {
    if (!url) return;
    currentLanUrl = url;

    const modalUrlInput = document.getElementById('modal-wifi-url');
    if (modalUrlInput) modalUrlInput.value = url;

    const sideUrlInput = document.getElementById('wifi-lan-url');
    if (sideUrlInput) sideUrlInput.value = url;

    // Render client-side vector/canvas QR codes
    renderQrToElement('modal-wifi-qr-target', url, 210);
    renderQrToElement('wifi-qr-target', url, 160);

    // Legacy image elements if needed
    if (qrDataUrl) {
      const modalImg = document.getElementById('modal-wifi-qr-img');
      if (modalImg) modalImg.src = qrDataUrl;
      const sideImg = document.getElementById('wifi-qr-img');
      if (sideImg) sideImg.src = qrDataUrl;
    }

    // Multiple adapter switcher
    if (allIps && allIps.length > 1) {
      detectedNetworkIps = allIps;
      const adapterRow = document.getElementById('wifi-adapter-selector-row');
      const adapterSelect = document.getElementById('wifi-adapter-select');
      if (adapterRow && adapterSelect) {
        adapterRow.classList.remove('hidden');
        adapterSelect.innerHTML = allIps.map(item => `
          <option value="${item.url}" ${item.url === url ? 'selected' : ''}>
            ${escapeHtml(item.name)} (${item.ip})
          </option>
        `).join('');

        adapterSelect.onchange = (e) => {
          updateNetworkDisplay(e.target.value, null, detectedNetworkIps);
        };
      }
    }
  }

  // 1. Fetch Network Info on Startup & Refresh
  async function loadNetworkInfo() {
    const isGitHubPages = window.location.hostname.includes('github.io');
    const defaultUrl = isGitHubPages 
      ? window.location.href 
      : `${window.location.protocol}//${window.location.hostname || 'localhost'}:${window.location.port || '3000'}`;

    // Immediately show default URL & QR so modal is never empty or broken
    updateNetworkDisplay(defaultUrl);

    if (isGitHubPages) {
      const ghBanner = document.getElementById('wifi-github-pages-banner');
      if (ghBanner) ghBanner.classList.remove('hidden');
      const statusPill = document.getElementById('wifi-status-pill');
      if (statusPill) {
        statusPill.innerHTML = `<span class="pulse-dot-blue"></span> GITHUB PAGES CLOUD`;
        statusPill.className = 'wifi-status-indicator cloud';
      }
      const intro = document.getElementById('wifi-modal-intro');
      if (intro) {
        intro.textContent = 'Scan with mobile camera to join immediately, or use direct P2P room:';
      }
      return;
    }

    try {
      const res = await fetch('/api/network-info');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.lanUrl) {
        updateNetworkDisplay(data.lanUrl, data.qrCodeDataUrl, data.allIps || []);
        const statusPill = document.getElementById('wifi-status-pill');
        if (statusPill) {
          statusPill.innerHTML = `<span class="pulse-dot-green"></span> LAN DETECTED: ${data.localIp}`;
          statusPill.className = 'wifi-status-indicator online';
        }
      }
    } catch (e) {
      console.warn('Network info backend fetch not available, running in standalone mode:', e);
      const statusPill = document.getElementById('wifi-status-pill');
      if (statusPill) {
        statusPill.innerHTML = `<span class="pulse-dot-blue"></span> STANDALONE / LOCAL`;
        statusPill.className = 'wifi-status-indicator cloud';
      }
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

    if (socket && socket.connected) {
      socket.emit('user:register', {
        username,
        avatar: selectedAvatar
      });
    } else {
      // Offline / Static Hosting Registration
      const user = {
        id: localStorage.getItem('neo_tic_user_id') || 'local_' + Math.random().toString(36).substring(2, 8),
        username,
        avatar: selectedAvatar,
        wins: parseInt(localStorage.getItem('neo_tic_wins') || '0', 10),
        losses: parseInt(localStorage.getItem('neo_tic_losses') || '0', 10),
        draws: parseInt(localStorage.getItem('neo_tic_draws') || '0', 10),
        rating: parseInt(localStorage.getItem('neo_tic_rating') || '1000', 10)
      };
      currentUser = user;
      localStorage.setItem('neo_tic_user_id', user.id);
      localStorage.setItem('neo_tic_username', user.username);
      localStorage.setItem('neo_tic_avatar', user.avatar);

      updateUserProfileUI();
      showScreen('lobby');
      showToast('⚡ Standalone Mode: Play vs Cyber AI, Local Duel, or P2P WebRTC!');
    }
  });

  if (socket) {
    socket.on('user:registered', ({ user, network }) => {
      currentUser = user;
      localStorage.setItem('neo_tic_user_id', user.id);
      localStorage.setItem('neo_tic_username', user.username);
      localStorage.setItem('neo_tic_avatar', user.avatar);

      if (network && network.lanUrl) {
        updateNetworkDisplay(network.lanUrl);
      }

      updateUserProfileUI();
      showScreen('lobby');
      loadLeaderboardAndHistory();
    });
  }

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

      if (socket && socket.connected) {
        socket.emit('user:register', {
          userId: cachedId,
          username: cachedName,
          avatar: cachedAvatar
        });
      } else {
        currentUser = {
          id: cachedId || 'usr_local',
          username: cachedName,
          avatar: cachedAvatar,
          wins: parseInt(localStorage.getItem('neo_tic_wins') || '0', 10),
          losses: parseInt(localStorage.getItem('neo_tic_losses') || '0', 10),
          draws: parseInt(localStorage.getItem('neo_tic_draws') || '0', 10),
          rating: parseInt(localStorage.getItem('neo_tic_rating') || '1000', 10)
        };
        updateUserProfileUI();
        showScreen('lobby');
      }
    }
  }

  // Auto-register on socket connect / reconnect
  if (socket) {
    socket.on('connect', () => {
      console.log('[SOCKET] Connected to arena server:', socket.id);
      sendRegistration();
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    loadNetworkInfo();
    sendRegistration();

    // Combat Mode Buttons
    const btnPlayAi = document.getElementById('btn-play-ai');
    if (btnPlayAi) {
      btnPlayAi.addEventListener('click', () => {
        window.soundEngine.playClick();
        startAiCombat();
      });
    }

    const btnPassPlay = document.getElementById('btn-pass-play');
    if (btnPassPlay) {
      btnPassPlay.addEventListener('click', () => {
        window.soundEngine.playClick();
        startPassAndPlay();
      });
    }

    const btnQuickAiReg = document.getElementById('btn-quick-ai-reg');
    if (btnQuickAiReg) {
      btnQuickAiReg.addEventListener('click', () => {
        window.soundEngine.playClick();
        const inputName = document.getElementById('reg-username')?.value.trim();
        if (inputName) {
          localStorage.setItem('neo_tic_username', inputName);
        }
        startAiCombat();
      });
    }

    const btnQuickPassReg = document.getElementById('btn-quick-pass-reg');
    if (btnQuickPassReg) {
      btnQuickPassReg.addEventListener('click', () => {
        window.soundEngine.playClick();
        const inputName = document.getElementById('reg-username')?.value.trim();
        if (inputName) {
          localStorage.setItem('neo_tic_username', inputName);
        }
        startPassAndPlay();
      });
    }

    const btnP2pRoom = document.getElementById('btn-p2p-room');
    if (btnP2pRoom) {
      btnP2pRoom.addEventListener('click', () => {
        window.soundEngine.playClick();
        openP2pModal();
      });
    }

    const btnCloseP2p = document.getElementById('btn-close-p2p');
    if (btnCloseP2p) {
      btnCloseP2p.addEventListener('click', () => {
        hideModal('p2pRoom');
      });
    }

    const btnConnectP2p = document.getElementById('btn-connect-p2p');
    if (btnConnectP2p) {
      btnConnectP2p.addEventListener('click', () => {
        const codeInput = document.getElementById('p2p-input-code').value.trim();
        if (codeInput) connectToP2pPeer(codeInput);
      });
    }

    const btnCopyP2p = document.getElementById('btn-copy-p2p-link');
    if (btnCopyP2p) {
      btnCopyP2p.addEventListener('click', () => {
        const code = document.getElementById('p2p-my-code-display').textContent;
        const link = window.location.origin + window.location.pathname + '?room=' + code;
        navigator.clipboard.writeText(link).then(() => {
          showToast('📋 P2P room invite link copied to clipboard!');
        }).catch(() => {
          showToast(link);
        });
      });
    }

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
        if (socket && socket.connected) {
          socket.emit('lobby:refresh');
        }
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
        if (socket && socket.connected) {
          socket.emit('match:quick_match');
        } else {
          startAiCombat();
        }
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
      const playableUrl = currentLanUrl || document.getElementById('wifi-lan-url')?.value || window.location.href;
      listEl.innerHTML = `
        <div class="empty-state">
          <div style="font-size:28px;margin-bottom:8px;">📡</div>
          <strong style="color:#fff;font-size:15px;">You are currently the only player in the arena lobby.</strong><br><br>
          <span style="font-size:13px;color:var(--neon-cyan);">
            To connect & play: Open <strong>${escapeHtml(playableUrl)}</strong> on your phone or scan the Wi-Fi QR code!
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
        if (!socket || !socket.connected) {
          showToast('⚠️ Arena server not connected. Connect both devices to the same Wi-Fi network.');
          return;
        }
        btn.textContent = 'TRANSMITTING...';
        btn.disabled = true;
        socket.emit('challenge:send', { targetUserId });
        setTimeout(() => {
          if (btn.textContent === 'TRANSMITTING...') {
            btn.textContent = '⚔️ CONNECT & PLAY';
            btn.disabled = false;
          }
        }, 5000);
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

  function setupMatchArena(matchId, p1, p2, hostId, extraOptions = {}) {
    currentMatch = {
      ...(currentMatch || {}),
      matchId,
      p1,
      p2,
      hostId,
      currentRound: 1,
      scores: { [p1.id]: 0, [p2.id]: 0 },
      board: Array(9).fill(null),
      currentTurn: p1.id,
      ...extraOptions
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
        if (currentMatch.isLocal) {
          currentMatch.p1.symbol = myChosenSymbol;
          currentMatch.p2.symbol = myChosenSymbol === 'X' ? 'O' : 'X';
          document.getElementById('hud-p1-symbol').textContent = currentMatch.p1.symbol;
          document.getElementById('hud-p2-symbol').textContent = currentMatch.p2.symbol;
          return;
        }
        if (currentMatch.isP2p) {
          currentMatch.p1.symbol = myChosenSymbol;
          currentMatch.p2.symbol = myChosenSymbol === 'X' ? 'O' : 'X';
          document.getElementById('hud-p1-symbol').textContent = currentMatch.p1.symbol;
          document.getElementById('hud-p2-symbol').textContent = currentMatch.p2.symbol;
          if (p2pActiveConn && p2pActiveConn.open) {
            p2pActiveConn.send({ type: 'symbol_chosen', p1Symbol: currentMatch.p1.symbol, p2Symbol: currentMatch.p2.symbol });
          }
          return;
        }
        if (socket && socket.connected) {
          socket.emit('match:choose_symbol', {
            matchId: currentMatch.matchId,
            chosenSymbol: myChosenSymbol
          });
        }
      }
    });
  });

  if (socket) {
    socket.on('match:symbols_assigned', ({ p1, p2, startingUserId }) => {
      if (!currentMatch) return;
      currentMatch.p1 = p1;
      currentMatch.p2 = p2;
      currentMatch.currentTurn = startingUserId;

      document.getElementById('hud-p1-symbol').textContent = p1.symbol;
      document.getElementById('hud-p2-symbol').textContent = p2.symbol;
    });
  }

  document.getElementById('btn-lock-symbol').addEventListener('click', () => {
    window.soundEngine.playClick();
    if (!currentMatch) return;
    if (currentMatch.isLocal) {
      startLocalCountdown(currentMatch.roundName || 'ROUND 1', () => {
        startLocalRound(1);
      });
      return;
    }
    if (currentMatch.isP2p) {
      if (p2pActiveConn && p2pActiveConn.open) {
        p2pActiveConn.send({ type: 'start_countdown' });
      }
      startLocalCountdown(currentMatch.roundName || 'ROUND 1', () => {
        startLocalRound(1);
      });
      return;
    }
    if (socket && socket.connected) {
      socket.emit('match:start_countdown', {
        matchId: currentMatch.matchId
      });
    }
  });

  // --- OFFLINE / STATIC MODES & TACTICAL AI ENGINE ---
  const WIN_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  function checkWinnerLocal(board) {
    for (const combo of WIN_COMBOS) {
      const [a, b, c] = combo;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winnerSymbol: board[a], combo };
      }
    }
    if (board.every(cell => cell !== null)) {
      return { isDraw: true };
    }
    return null;
  }

  function getBestAiMove(board, aiSymbol, playerSymbol) {
    // 1. Check if AI can win immediately
    for (const combo of WIN_COMBOS) {
      const [a, b, c] = combo;
      if (board[a] === aiSymbol && board[b] === aiSymbol && board[c] === null) return c;
      if (board[a] === aiSymbol && board[c] === aiSymbol && board[b] === null) return b;
      if (board[b] === aiSymbol && board[c] === aiSymbol && board[a] === null) return a;
    }
    // 2. Check if player has immediate win and block it
    for (const combo of WIN_COMBOS) {
      const [a, b, c] = combo;
      if (board[a] === playerSymbol && board[b] === playerSymbol && board[c] === null) return c;
      if (board[a] === playerSymbol && board[c] === playerSymbol && board[b] === null) return b;
      if (board[b] === playerSymbol && board[c] === playerSymbol && board[a] === null) return a;
    }
    // 3. Take center cell if available
    if (board[4] === null) return 4;
    // 4. Take corners if available
    const corners = [0, 2, 6, 8].filter(idx => board[idx] === null);
    if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
    // 5. Take any remaining empty cell
    const empty = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
    return empty[Math.floor(Math.random() * empty.length)];
  }

  function ensureUser() {
    if (!currentUser) {
      currentUser = {
        id: localStorage.getItem('neo_tic_user_id') || 'usr_' + Math.random().toString(36).substring(2, 8),
        username: localStorage.getItem('neo_tic_username') || 'Warrior',
        avatar: localStorage.getItem('neo_tic_avatar') || selectedAvatar,
        wins: parseInt(localStorage.getItem('neo_tic_wins') || '0', 10),
        losses: parseInt(localStorage.getItem('neo_tic_losses') || '0', 10),
        draws: parseInt(localStorage.getItem('neo_tic_draws') || '0', 10),
        rating: parseInt(localStorage.getItem('neo_tic_rating') || '1000', 10)
      };
      updateUserProfileUI();
    }
  }

  function startAiCombat() {
    ensureUser();
    currentMatch = {
      isLocal: true,
      isAiMatch: true,
      matchId: 'ai_' + Date.now(),
      p1: { id: currentUser.id, username: currentUser.username, avatar: currentUser.avatar, symbol: 'X' },
      p2: { id: 'ai_bot', username: 'CYBER_CORE 🤖', avatar: 'mecha_core', symbol: 'O' },
      scores: { [currentUser.id]: 0, 'ai_bot': 0 },
      currentRound: 1,
      roundName: 'ROUND 1',
      clashesCount: 0,
      board: Array(9).fill(null),
      currentTurn: currentUser.id
    };

    setupMatchArena(currentMatch.matchId, currentMatch.p1, currentMatch.p2, currentUser.id);
    showToast('🤖 Battle vs Tactical Cyber AI initiated. Lock in your symbol to strike!');
  }

  function startPassAndPlay() {
    ensureUser();
    currentMatch = {
      isLocal: true,
      isPassAndPlay: true,
      matchId: 'passplay_' + Date.now(),
      p1: { id: currentUser.id, username: currentUser.username, avatar: currentUser.avatar, symbol: 'X' },
      p2: { id: 'guest_p2', username: 'Player 2 (Guest)', avatar: 'apex_hunter', symbol: 'O' },
      scores: { [currentUser.id]: 0, 'guest_p2': 0 },
      currentRound: 1,
      roundName: 'ROUND 1',
      clashesCount: 0,
      board: Array(9).fill(null),
      currentTurn: currentUser.id
    };

    setupMatchArena(currentMatch.matchId, currentMatch.p1, currentMatch.p2, currentUser.id);
    showToast('👥 Local Duel (Pass & Play) initiated. 2 players take turns on this device!');
  }

  function startLocalCountdown(roundName = 'ROUND 1', onComplete) {
    document.getElementById('countdown-round-name').textContent = `${roundName} COMMENCING`;
    showModal('countdown');

    let count = 5;
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
          if (onComplete) onComplete();
        }, 700);
      } else {
        numEl.textContent = count;
        window.soundEngine.playCountdownTick(count);
      }
    }, 1000);
  }

  function startLocalRound(roundNum = 1, isClash = false) {
    hideModal('clash');
    hideStrikeLine();
    clearBoardCells();

    currentMatch.currentRound = roundNum;
    currentMatch.roundName = roundNum === 1 ? 'ROUND 1' : (roundNum === 2 ? 'ROUND 2' : 'FINAL ROUND');
    currentMatch.board = Array(9).fill(null);

    // Switch Bottom Dock to Gameplay
    document.getElementById('dock-symbol-picker').classList.add('hidden');
    document.getElementById('dock-gameplay').classList.remove('hidden');

    // Update Round Headers
    document.getElementById('arena-round-badge').textContent = currentMatch.roundName + (isClash ? ' (REPLAY)' : '');
    updateRoundTrackerDots(roundNum);

    // Update HUD Scores
    document.getElementById('hud-p1-score').textContent = currentMatch.scores[currentMatch.p1.id] || 0;
    document.getElementById('hud-p2-score').textContent = currentMatch.scores[currentMatch.p2.id] || 0;
    document.getElementById('header-p1-score').textContent = currentMatch.scores[currentMatch.p1.id] || 0;
    document.getElementById('header-p2-score').textContent = currentMatch.scores[currentMatch.p2.id] || 0;

    // Starting turn: X strikes first
    const startingTurn = currentMatch.p1.symbol === 'X' ? currentMatch.p1.id : currentMatch.p2.id;
    currentMatch.currentTurn = startingTurn;
    updateTurnHUD(startingTurn);

    if (currentMatch.isAiMatch && startingTurn === 'ai_bot') {
      setTimeout(makeAiMove, 600);
    }
  }

  function applyLocalMoveVisual(index, symbol) {
    currentMatch.board[index] = symbol;
    const cell = document.getElementById(`cell-${index}`);
    if (cell) {
      cell.textContent = symbol;
      cell.classList.add('claimed', symbol === 'X' ? 'cell-x' : 'cell-o');

      const rect = cell.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const color = symbol === 'X' ? '#00f0ff' : '#ff0055';
      if (window.fxCanvas) {
        window.fxCanvas.emitBurst(cx, cy, color, 24);
      }

      if (symbol === 'X') {
        window.soundEngine.playMoveX();
      } else {
        window.soundEngine.playMoveO();
      }
    }
  }

  function handleLocalCellClick(index) {
    if (!currentMatch || currentMatch.board[index] !== null) return;

    if (currentMatch.isAiMatch) {
      if (currentMatch.currentTurn !== currentUser.id) return;
      applyLocalMoveVisual(index, currentMatch.p1.symbol);

      const res = checkWinnerLocal(currentMatch.board);
      if (res) {
        handleLocalRoundEnd(res);
        return;
      }

      currentMatch.currentTurn = 'ai_bot';
      updateTurnHUD('ai_bot');
      setTimeout(makeAiMove, 550);
    } else if (currentMatch.isPassAndPlay) {
      const activeId = currentMatch.currentTurn;
      const isP1 = activeId === currentMatch.p1.id;
      const symbol = isP1 ? currentMatch.p1.symbol : currentMatch.p2.symbol;
      applyLocalMoveVisual(index, symbol);

      const res = checkWinnerLocal(currentMatch.board);
      if (res) {
        handleLocalRoundEnd(res);
        return;
      }

      const nextTurn = isP1 ? currentMatch.p2.id : currentMatch.p1.id;
      currentMatch.currentTurn = nextTurn;
      updateTurnHUD(nextTurn);
    }
  }

  function makeAiMove() {
    if (!currentMatch || !currentMatch.isAiMatch) return;
    const aiSymbol = currentMatch.p2.symbol;
    const playerSymbol = currentMatch.p1.symbol;
    const bestMove = getBestAiMove(currentMatch.board, aiSymbol, playerSymbol);

    if (bestMove !== null && bestMove !== undefined) {
      applyLocalMoveVisual(bestMove, aiSymbol);

      const res = checkWinnerLocal(currentMatch.board);
      if (res) {
        handleLocalRoundEnd(res);
        return;
      }

      currentMatch.currentTurn = currentUser.id;
      updateTurnHUD(currentUser.id);
    }
  }

  function handleLocalRoundEnd(res) {
    if (res.winnerSymbol) {
      const isP1 = currentMatch.p1.symbol === res.winnerSymbol;
      const winner = isP1 ? currentMatch.p1 : currentMatch.p2;
      currentMatch.scores[winner.id] = (currentMatch.scores[winner.id] || 0) + 1;

      if (res.combo) {
        res.combo.forEach(idx => {
          const c = document.getElementById(`cell-${idx}`);
          if (c) c.classList.add('winning-cell');
        });
        drawStrikeLine(res.combo);
      }
      window.soundEngine.playRoundWin();

      const dot = document.getElementById(`dot-round-${currentMatch.currentRound}`);
      if (dot) dot.classList.add(isP1 ? 'won-p1' : 'won-p2');

      document.getElementById('hud-p1-score').textContent = currentMatch.scores[currentMatch.p1.id] || 0;
      document.getElementById('hud-p2-score').textContent = currentMatch.scores[currentMatch.p2.id] || 0;
      document.getElementById('header-p1-score').textContent = currentMatch.scores[currentMatch.p1.id] || 0;
      document.getElementById('header-p2-score').textContent = currentMatch.scores[currentMatch.p2.id] || 0;

      document.getElementById('dock-turn-message').textContent = `ROUND WON BY ${winner.username.toUpperCase()}!`;
      document.getElementById('dock-turn-message').style.color = 'var(--neon-gold)';

      const p1Score = currentMatch.scores[currentMatch.p1.id] || 0;
      const p2Score = currentMatch.scores[currentMatch.p2.id] || 0;
      const tournamentOver = p1Score >= 2 || p2Score >= 2 || (currentMatch.currentRound >= 3 && p1Score !== p2Score);

      if (tournamentOver) {
        const finalWinner = p1Score > p2Score ? currentMatch.p1 : currentMatch.p2;
        if (finalWinner.id === currentUser.id) {
          currentUser.wins = (currentUser.wins || 0) + 1;
          localStorage.setItem('neo_tic_wins', currentUser.wins);
        } else {
          currentUser.losses = (currentUser.losses || 0) + 1;
          localStorage.setItem('neo_tic_losses', currentUser.losses);
        }
        updateUserProfileUI();

        setTimeout(() => {
          document.getElementById('victory-winner-name').textContent = `${finalWinner.username.toUpperCase()} WINS!`;
          document.getElementById('victory-p1-name').textContent = currentMatch.p1.username;
          document.getElementById('victory-p2-name').textContent = currentMatch.p2.username;
          document.getElementById('victory-p1-score').textContent = p1Score;
          document.getElementById('victory-p2-score').textContent = p2Score;
          document.getElementById('victory-rounds-count').textContent = currentMatch.currentRound;
          document.getElementById('victory-clashes-count').textContent = currentMatch.clashesCount || 0;

          if (finalWinner.id === currentUser.id) {
            window.soundEngine.playMatchVictory();
            if (window.fxCanvas) {
              window.fxCanvas.celebrateVictory();
            }
          }
          showModal('victory');
        }, 1200);
      } else {
        setTimeout(() => {
          startLocalRound(currentMatch.currentRound + 1);
        }, 2200);
      }
    } else if (res.isDraw) {
      currentMatch.clashesCount = (currentMatch.clashesCount || 0) + 1;
      window.soundEngine.playClash();
      showModal('clash');
      document.getElementById('dock-turn-message').textContent = `⚡ CLASH DETECTED • REPLAYING ROUND ${currentMatch.currentRound} ⚡`;
      setTimeout(() => {
        startLocalRound(currentMatch.currentRound, true);
      }, 2500);
    }
  }

  // --- SERVERLESS P2P WEBRTC (PEERJS) ---
  let peerInstance = null;
  let p2pActiveConn = null;

  function initP2pPeer() {
    if (peerInstance || typeof Peer === 'undefined') return;
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const myPeerId = 'neo-' + randomSuffix;
    try {
      peerInstance = new Peer(myPeerId);
      peerInstance.on('open', (id) => {
        const display = document.getElementById('p2p-my-code-display');
        if (display) display.textContent = id;
      });
      peerInstance.on('connection', (conn) => {
        setupP2pConnection(conn, false);
      });
      peerInstance.on('error', (err) => {
        console.warn('Peer error:', err);
      });
    } catch (e) {
      console.warn('PeerJS init failed:', e);
    }
  }

  function openP2pModal() {
    ensureUser();
    initP2pPeer();
    showModal('p2pRoom');
  }

  function connectToP2pPeer(targetPeerId) {
    if (!peerInstance) initP2pPeer();
    if (!targetPeerId) return;
    showToast(`Connecting to peer ${targetPeerId}...`);
    const conn = peerInstance.connect(targetPeerId);
    setupP2pConnection(conn, true);
  }

  function setupP2pConnection(conn, isInitiator) {
    p2pActiveConn = conn;
    conn.on('open', () => {
      hideModal('p2pRoom');
      showToast('⚡ P2P WebRTC Connection Established! Initializing Arena...');
      ensureUser();

      if (isInitiator) {
        conn.send({ type: 'handshake', username: currentUser.username, avatar: currentUser.avatar });
      }
    });

    conn.on('data', (data) => {
      handleP2pMessage(data);
    });

    conn.on('close', () => {
      showToast('P2P connection closed by remote peer.');
      showScreen('lobby');
    });
  }

  function handleP2pMessage(data) {
    if (data.type === 'handshake') {
      currentMatch = {
        isP2p: true,
        isHost: true,
        matchId: 'p2p_' + Date.now(),
        p1: { id: currentUser.id, username: currentUser.username, avatar: currentUser.avatar, symbol: 'X' },
        p2: { id: 'peer_opponent', username: data.username, avatar: data.avatar, symbol: 'O' },
        scores: { [currentUser.id]: 0, 'peer_opponent': 0 },
        currentRound: 1,
        board: Array(9).fill(null),
        currentTurn: currentUser.id
      };
      p2pActiveConn.send({ type: 'handshake_ack', username: currentUser.username, avatar: currentUser.avatar });
      setupMatchArena(currentMatch.matchId, currentMatch.p1, currentMatch.p2, currentUser.id);
    } else if (data.type === 'handshake_ack') {
      currentMatch = {
        isP2p: true,
        isHost: false,
        matchId: 'p2p_' + Date.now(),
        p1: { id: 'peer_host', username: data.username, avatar: data.avatar, symbol: 'X' },
        p2: { id: currentUser.id, username: currentUser.username, avatar: currentUser.avatar, symbol: 'O' },
        scores: { 'peer_host': 0, [currentUser.id]: 0 },
        currentRound: 1,
        board: Array(9).fill(null),
        currentTurn: 'peer_host'
      };
      setupMatchArena(currentMatch.matchId, currentMatch.p1, currentMatch.p2, 'peer_host');
    } else if (data.type === 'symbol_chosen') {
      currentMatch.p1.symbol = data.p1Symbol;
      currentMatch.p2.symbol = data.p2Symbol;
      document.getElementById('hud-p1-symbol').textContent = data.p1Symbol;
      document.getElementById('hud-p2-symbol').textContent = data.p2Symbol;
    } else if (data.type === 'start_countdown') {
      startLocalCountdown(currentMatch.roundName || 'ROUND 1', () => {
        startLocalRound(1);
      });
    } else if (data.type === 'move') {
      applyLocalMoveVisual(data.index, data.symbol);
      const res = checkWinnerLocal(currentMatch.board);
      if (res) {
        handleLocalRoundEnd(res);
      } else {
        currentMatch.currentTurn = currentUser.id;
        updateTurnHUD(currentUser.id);
      }
    } else if (data.type === 'rematch_request') {
      const btn = document.getElementById('btn-request-rematch');
      if (btn) {
        btn.textContent = '⚔️ OPPONENT WANTS REMATCH! (CLICK TO ACCEPT)';
        btn.classList.add('neon-green');
      }
    }
  }

  function handleP2pCellClick(index) {
    if (currentMatch.currentTurn !== currentUser.id || currentMatch.board[index] !== null) return;
    const mySymbol = currentUser.id === currentMatch.p1.id ? currentMatch.p1.symbol : currentMatch.p2.symbol;
    applyLocalMoveVisual(index, mySymbol);

    if (p2pActiveConn && p2pActiveConn.open) {
      p2pActiveConn.send({ type: 'move', index, symbol: mySymbol });
    }

    const res = checkWinnerLocal(currentMatch.board);
    if (res) {
      handleLocalRoundEnd(res);
    } else {
      const oppId = currentUser.id === currentMatch.p1.id ? currentMatch.p2.id : currentMatch.p1.id;
      currentMatch.currentTurn = oppId;
      updateTurnHUD(oppId);
    }
  }

  // 10. 5-Second Countdown
  if (socket) {
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
  }

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
      headline.textContent = currentMatch.isAiMatch ? '🤖 CYBER AI CALCULATING...' : '⏳ OPPONENT ENGAGING...';
      headline.style.color = '#94a3b8';
      sub.textContent = 'Analyzing incoming tactical maneuvers.';
    }
  }

  // 12. Grid Cell Click
  const gridCells = document.querySelectorAll('.grid-cell');
  gridCells.forEach(cell => {
    cell.addEventListener('click', (e) => {
      if (!currentMatch || !currentUser) return;

      const index = parseInt(cell.dataset.index, 10);
      if (cell.classList.contains('claimed')) return;

      if (currentMatch.isLocal) {
        handleLocalCellClick(index);
        return;
      }

      if (currentMatch.isP2p) {
        handleP2pCellClick(index);
        return;
      }

      if (currentMatch.currentTurn !== currentUser.id) return;

      if (socket && socket.connected) {
        socket.emit('game:make_move', {
          matchId: currentMatch.matchId,
          index
        });
      }
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

    // Reset rematch button state
    const rematchBtn = document.getElementById('btn-request-rematch');
    if (rematchBtn) {
      rematchBtn.textContent = '⚔️ REQUEST REMATCH';
      rematchBtn.classList.remove('neon-green');
    }

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
    loadNetworkInfo();
  });

  document.getElementById('btn-close-wifi').addEventListener('click', () => {
    hideModal('wifi');
  });

  // Modal open in new tab
  const btnOpenModalWifi = document.getElementById('btn-modal-open-wifi');
  if (btnOpenModalWifi) {
    btnOpenModalWifi.addEventListener('click', () => {
      window.soundEngine.playClick();
      const url = document.getElementById('modal-wifi-url')?.value;
      if (url) window.open(url, '_blank');
    });
  }

  // Modal manual URL edit
  const modalWifiInput = document.getElementById('modal-wifi-url');
  if (modalWifiInput) {
    modalWifiInput.addEventListener('input', (e) => {
      const customUrl = e.target.value.trim();
      if (customUrl) {
        document.getElementById('wifi-lan-url').value = customUrl;
        renderQrToElement('modal-wifi-qr-target', customUrl, 210);
        renderQrToElement('wifi-qr-target', customUrl, 160);
      }
    });
  }

  // GitHub Pages banner to P2P button
  const btnWifiToP2p = document.getElementById('btn-wifi-to-p2p');
  if (btnWifiToP2p) {
    btnWifiToP2p.addEventListener('click', () => {
      window.soundEngine.playClick();
      hideModal('wifi');
      showModal('p2pRoom');
    });
  }

  // Copy Buttons
  function copyText(inputId, btnId) {
    const input = document.getElementById(inputId);
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById(btnId);
      const prev = btn.textContent;
      btn.textContent = 'COPIED!';
      setTimeout(() => { btn.textContent = prev; }, 2000);
    }).catch(() => {
      showToast(input.value);
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
