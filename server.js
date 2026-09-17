const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');
const os = require('node:os');
const path = require('node:path');
const QRCode = require('qrcode');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Helper: Get local Wi-Fi / LAN IP address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIpAddress();

// REST API for network info & QR code
app.get('/api/network-info', async (req, res) => {
  try {
    const lanUrl = `http://${localIp}:${PORT}`;
    const qrCodeDataUrl = await QRCode.toDataURL(lanUrl, {
      color: {
        dark: '#00f0ff',
        light: '#080a14'
      },
      margin: 1,
      width: 256
    });
    res.json({
      localIp,
      port: PORT,
      lanUrl,
      qrCodeDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate network QR code' });
  }
});

// REST API for leaderboard & history
app.get('/api/leaderboard', (req, res) => {
  const leaders = db.getLeaderboard(15);
  res.json(leaders);
});

app.get('/api/recent-matches', (req, res) => {
  const matches = db.getRecentMatches(10);
  res.json(matches);
});

// State Management
// connectedUsers: userId -> { user, socketId, status: 'available'|'in_challenge'|'in_battle' }
const connectedUsers = new Map();
// socketToUser: socketId -> userId
const socketToUser = new Map();
// activeChallenges: challengeId -> { challengerId, targetId, timerId, matchId }
const activeChallenges = new Map();
// activeMatches: matchId -> matchState
const activeMatches = new Map();

function broadcastLobby() {
  const playersList = Array.from(connectedUsers.values()).map(item => ({
    id: item.user.id,
    username: item.user.username,
    avatar: item.user.avatar,
    wins: item.user.wins,
    losses: item.user.losses,
    draws: item.user.draws,
    matches_played: item.user.matches_played,
    rating: item.user.rating,
    status: item.status
  }));

  io.emit('lobby:update', playersList);
}

const WIN_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Horizontal
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Vertical
  [0, 4, 8], [2, 4, 6]             // Diagonal
];

function checkWinner(board) {
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

function getRoundTitle(roundNum) {
  if (roundNum === 1) return 'ROUND 1';
  if (roundNum === 2) return 'ROUND 2';
  return 'FINAL ROUND';
}

io.on('connection', (socket) => {
  console.log(`[ARENA] Socket connected: ${socket.id}`);

  // 1. User Registration / Reconnection
  socket.on('user:register', ({ username, avatar, userId }) => {
    let user = null;
    if (userId) {
      user = db.getUser(userId);
    }
    if (!user && username) {
      user = db.findOrCreateUser(username, avatar);
    }
    if (!user) {
      socket.emit('error', { message: 'Invalid user registration credentials' });
      return;
    }

    // Check if another active device is already using this user account
    if (connectedUsers.has(user.id) && connectedUsers.get(user.id).socketId !== socket.id) {
      console.log(`[ARENA] Account ${user.username} already in use by socket ${connectedUsers.get(user.id).socketId}. Creating distinct player for socket ${socket.id}`);
      const altName = `${username} (P2)`;
      user = db.findOrCreateUser(altName, avatar || 'mecha_core');
    }

    socketToUser.set(socket.id, user.id);
    connectedUsers.set(user.id, {
      user,
      socketId: socket.id,
      status: 'available'
    });

    console.log(`[ARENA] User registered/active: ${user.username} (${user.id}) on socket ${socket.id}. Total online: ${connectedUsers.size}`);

    socket.emit('user:registered', {
      user,
      network: {
        localIp,
        port: PORT,
        lanUrl: `http://${localIp}:${PORT}`
      }
    });

    broadcastLobby();
  });

  // Re-broadcast lobby on request
  socket.on('lobby:refresh', () => {
    broadcastLobby();
  });

  // Quick Match: Automatically challenge the first available opponent
  socket.on('match:quick_match', () => {
    const senderId = socketToUser.get(socket.id);
    if (!senderId) return;
    const senderSession = connectedUsers.get(senderId);
    if (!senderSession || senderSession.status !== 'available') return;

    let target = null;
    for (const [uid, session] of connectedUsers.entries()) {
      if (uid !== senderId && session.status === 'available') {
        target = session;
        break;
      }
    }

    if (!target) {
      socket.emit('challenge:failed', { message: 'No other opponents are currently available on Wi-Fi. Ask a friend to scan the QR code!' });
      return;
    }

    // Trigger challenge to target
    initiateChallenge(socket, senderId, target.user.id);
  });

  function initiateChallenge(socket, senderId, targetUserId) {
    const senderSession = connectedUsers.get(senderId);
    const targetSession = connectedUsers.get(targetUserId);

    if (!senderSession || !targetSession) {
      socket.emit('challenge:failed', { message: 'Target player is no longer online.' });
      return;
    }

    if (targetSession.status !== 'available') {
      socket.emit('challenge:failed', { message: `Target player is currently ${targetSession.status === 'in_battle' ? 'in battle' : 'busy'}.` });
      return;
    }

    const challengeId = 'chal_' + Date.now();
    senderSession.status = 'in_challenge';
    targetSession.status = 'in_challenge';
    broadcastLobby();

    console.log(`[ARENA] Challenge sent: ${senderSession.user.username} -> ${targetSession.user.username} (ID: ${challengeId})`);

    // 30 seconds timer for challenge acceptance
    const timerId = setTimeout(() => {
      if (activeChallenges.has(challengeId)) {
        activeChallenges.delete(challengeId);

        if (senderSession && senderSession.status === 'in_challenge') senderSession.status = 'available';
        if (targetSession && targetSession.status === 'in_challenge') targetSession.status = 'available';

        io.to(senderSession.socketId).emit('challenge:timeout', { message: 'Invitation timed out after 30 seconds.' });
        io.to(targetSession.socketId).emit('challenge:timeout', { message: 'Invitation expired.' });
        broadcastLobby();
      }
    }, 30000);

    activeChallenges.set(challengeId, {
      challengeId,
      challengerId: senderId,
      targetId: targetUserId,
      timerId
    });

    // Notify challenger that invitation was transmitted
    socket.emit('challenge:sent', {
      challengeId,
      target: targetSession.user,
      timeoutSeconds: 30
    });

    // Send invitation pop-up to target
    io.to(targetSession.socketId).emit('challenge:incoming', {
      challengeId,
      challenger: senderSession.user,
      timeoutSeconds: 30
    });
  }

  // 2. Send Challenge Invitation (30s timeout)
  socket.on('challenge:send', ({ targetUserId }) => {
    const senderId = socketToUser.get(socket.id);
    if (!senderId) return;
    initiateChallenge(socket, senderId, targetUserId);
  });

  // 3. Challenge Response (Accept / Decline)
  socket.on('challenge:respond', ({ challengeId, accepted }) => {
    const challenge = activeChallenges.get(challengeId);
    if (!challenge) return;

    clearTimeout(challenge.timerId);
    activeChallenges.delete(challengeId);

    const senderSession = connectedUsers.get(challenge.challengerId);
    const targetSession = connectedUsers.get(challenge.targetId);

    if (!accepted) {
      if (senderSession) {
        senderSession.status = 'available';
        io.to(senderSession.socketId).emit('challenge:declined', { message: `${targetSession ? targetSession.user.username : 'Player'} declined the battle challenge.` });
      }
      if (targetSession) {
        targetSession.status = 'available';
      }
      broadcastLobby();
      return;
    }

    // Challenge accepted! Establish connection
    if (!senderSession || !targetSession) {
      if (senderSession) senderSession.status = 'available';
      if (targetSession) targetSession.status = 'available';
      broadcastLobby();
      return;
    }

    const matchId = 'arena_' + Date.now();
    const roomName = `room_${matchId}`;

    senderSession.status = 'in_battle';
    targetSession.status = 'in_battle';
    broadcastLobby();

    const senderSocket = io.sockets.sockets.get(senderSession.socketId);
    const targetSocket = io.sockets.sockets.get(targetSession.socketId);

    if (senderSocket) senderSocket.join(roomName);
    if (targetSocket) targetSocket.join(roomName);

    // Initial Match State
    const matchState = {
      id: matchId,
      roomName,
      p1: {
        id: senderSession.user.id,
        username: senderSession.user.username,
        avatar: senderSession.user.avatar,
        symbol: 'X' // default, can be chosen
      },
      p2: {
        id: targetSession.user.id,
        username: targetSession.user.username,
        avatar: targetSession.user.avatar,
        symbol: 'O'
      },
      hostId: senderSession.user.id,
      currentRound: 1,
      roundName: 'ROUND 1',
      scores: {
        [senderSession.user.id]: 0,
        [targetSession.user.id]: 0
      },
      clashesCount: 0,
      roundsPlayed: 0,
      board: Array(9).fill(null),
      currentTurn: senderSession.user.id, // Host starts Round 1
      firstTurnOfRound: senderSession.user.id,
      status: 'connected',
      rematchVotes: {}
    };

    activeMatches.set(matchId, matchState);

    // Emit Connection Established success message
    io.to(roomName).emit('match:connected', {
      matchId,
      message: 'Connection Established! Synchronizing Arenas...',
      p1: matchState.p1,
      p2: matchState.p2,
      hostId: matchState.hostId
    });
  });

  // 4. Symbol Selection (Choose "X" or "O")
  socket.on('match:choose_symbol', ({ matchId, chosenSymbol }) => {
    const match = activeMatches.get(matchId);
    if (!match || match.status !== 'connected') return;

    const userId = socketToUser.get(socket.id);
    if (userId !== match.hostId) {
      socket.emit('error', { message: 'Host selects starting combat symbols.' });
      return;
    }

    const p1Symbol = chosenSymbol === 'O' ? 'O' : 'X';
    const p2Symbol = p1Symbol === 'X' ? 'O' : 'X';

    match.p1.symbol = p1Symbol;
    match.p2.symbol = p2Symbol;

    // Symbol X always takes first turn in Tic-Tac-Toe
    const startingUserId = p1Symbol === 'X' ? match.p1.id : match.p2.id;
    match.currentTurn = startingUserId;
    match.firstTurnOfRound = startingUserId;

    io.to(match.roomName).emit('match:symbols_assigned', {
      p1: match.p1,
      p2: match.p2,
      startingUserId
    });
  });

  // 5. Trigger 5-Second Game Countdown
  socket.on('match:start_countdown', ({ matchId }) => {
    const match = activeMatches.get(matchId);
    if (!match) return;

    const userId = socketToUser.get(socket.id);
    if (userId !== match.hostId && userId !== match.p1.id && userId !== match.p2.id) return;

    match.status = 'countdown';

    // Broadcast 5-second countdown to both players
    io.to(match.roomName).emit('match:countdown_start', {
      durationSeconds: 5,
      roundName: match.roundName,
      currentRound: match.currentRound
    });

    setTimeout(() => {
      const active = activeMatches.get(matchId);
      if (!active) return;
      active.status = 'playing';
      active.board = Array(9).fill(null);

      io.to(active.roomName).emit('game:round_start', {
        matchId: active.id,
        currentRound: active.currentRound,
        roundName: active.roundName,
        board: active.board,
        scores: active.scores,
        currentTurn: active.currentTurn,
        p1: active.p1,
        p2: active.p2
      });
    }, 5000);
  });

  // 6. Game Move
  socket.on('game:make_move', ({ matchId, index }) => {
    const match = activeMatches.get(matchId);
    if (!match || match.status !== 'playing') return;

    const userId = socketToUser.get(socket.id);
    if (userId !== match.currentTurn) {
      socket.emit('game:move_rejected', { reason: 'Not your turn!' });
      return;
    }

    if (index < 0 || index > 8 || match.board[index] !== null) {
      socket.emit('game:move_rejected', { reason: 'Slot already claimed.' });
      return;
    }

    const currentSymbol = userId === match.p1.id ? match.p1.symbol : match.p2.symbol;
    match.board[index] = currentSymbol;

    const result = checkWinner(match.board);

    if (result && result.winnerSymbol) {
      // Winner of this round!
      match.status = 'round_over';
      const roundWinnerId = result.winnerSymbol === match.p1.symbol ? match.p1.id : match.p2.id;
      const roundWinnerName = result.winnerSymbol === match.p1.symbol ? match.p1.username : match.p2.username;
      match.scores[roundWinnerId]++;
      match.roundsPlayed++;

      // Broadcast move + win
      io.to(match.roomName).emit('game:move_success', {
        index,
        symbol: currentSymbol,
        board: match.board,
        nextTurn: null
      });

      io.to(match.roomName).emit('game:round_won', {
        roundNumber: match.currentRound,
        roundName: match.roundName,
        winnerId: roundWinnerId,
        winnerName: roundWinnerName,
        winningCombo: result.combo,
        scores: match.scores
      });

      // Check Tournament Condition
      // Tournament is Best of 3:
      // If someone has 2 wins, tournament is won!
      // Or if this was the Final Round (round 3), highest score wins.
      const p1Score = match.scores[match.p1.id];
      const p2Score = match.scores[match.p2.id];

      const hasChampionshipWinner = (p1Score >= 2 || p2Score >= 2 || match.currentRound >= 3);

      if (hasChampionshipWinner) {
        setTimeout(() => {
          concludeTournament(match);
        }, 3200);
      } else {
        // Prepare next round (Round 2 or Final Round)
        match.currentRound++;
        match.roundName = getRoundTitle(match.currentRound);
        // Alternate starting player for the new round
        match.firstTurnOfRound = (match.firstTurnOfRound === match.p1.id) ? match.p2.id : match.p1.id;
        match.currentTurn = match.firstTurnOfRound;

        setTimeout(() => {
          if (!activeMatches.has(matchId)) return;
          match.status = 'playing';
          match.board = Array(9).fill(null);

          io.to(match.roomName).emit('game:round_start', {
            matchId: match.id,
            currentRound: match.currentRound,
            roundName: match.roundName,
            board: match.board,
            scores: match.scores,
            currentTurn: match.currentTurn,
            p1: match.p1,
            p2: match.p2
          });
        }, 3500);
      }
      return;
    }

    if (result && result.isDraw) {
      // User requirement 12: "Incase of draw /clash retry the same round again"
      match.status = 'clash';
      match.clashesCount++;

      io.to(match.roomName).emit('game:move_success', {
        index,
        symbol: currentSymbol,
        board: match.board,
        nextTurn: null
      });

      io.to(match.roomName).emit('game:clash_replay', {
        roundNumber: match.currentRound,
        roundName: match.roundName,
        clashesCount: match.clashesCount,
        message: `CLASH DETECTED! NO GROUND YIELDED. REPLAYING ${match.roundName}!`
      });

      // Reset same round after 3 seconds
      setTimeout(() => {
        if (!activeMatches.has(matchId)) return;
        match.status = 'playing';
        match.board = Array(9).fill(null);
        // Alternate starting player on clash replay so it stays balanced
        match.currentTurn = (match.currentTurn === match.p1.id) ? match.p2.id : match.p1.id;

        io.to(match.roomName).emit('game:round_start', {
          matchId: match.id,
          currentRound: match.currentRound,
          roundName: match.roundName,
          board: match.board,
          scores: match.scores,
          currentTurn: match.currentTurn,
          p1: match.p1,
          p2: match.p2,
          isClashReplay: true
        });
      }, 3000);
      return;
    }

    // Regular next turn
    match.currentTurn = (userId === match.p1.id) ? match.p2.id : match.p1.id;
    io.to(match.roomName).emit('game:move_success', {
      index,
      symbol: currentSymbol,
      board: match.board,
      nextTurn: match.currentTurn
    });
  });

  // Conclude tournament helper
  function concludeTournament(match) {
    match.status = 'match_over';
    const p1Score = match.scores[match.p1.id];
    const p2Score = match.scores[match.p2.id];

    let tournamentWinnerId = null;
    let tournamentWinnerName = 'Draw';

    if (p1Score > p2Score) {
      tournamentWinnerId = match.p1.id;
      tournamentWinnerName = match.p1.username;
    } else if (p2Score > p1Score) {
      tournamentWinnerId = match.p2.id;
      tournamentWinnerName = match.p2.username;
    }

    // Save match & achievements in SQLite database
    const dbResult = db.recordMatch({
      matchId: match.id,
      p1: match.p1,
      p2: match.p2,
      p1Score,
      p2Score,
      winnerId: tournamentWinnerId,
      clashesCount: match.clashesCount,
      roundsPlayed: match.roundsPlayed
    });

    // Update sessions in memory
    const s1 = connectedUsers.get(match.p1.id);
    const s2 = connectedUsers.get(match.p2.id);
    if (s1 && dbResult.p1) s1.user = dbResult.p1;
    if (s2 && dbResult.p2) s2.user = dbResult.p2;

    io.to(match.roomName).emit('game:tournament_concluded', {
      matchId: match.id,
      winnerId: tournamentWinnerId,
      winnerName: tournamentWinnerName,
      scores: match.scores,
      p1: dbResult.p1,
      p2: dbResult.p2,
      roundsPlayed: match.roundsPlayed,
      clashesCount: match.clashesCount,
      newAchievements: dbResult.newAchievements
    });

    broadcastLobby();
  }

  // 7. Surrender / Resign
  socket.on('game:resign', ({ matchId }) => {
    const match = activeMatches.get(matchId);
    if (!match || match.status === 'match_over') return;

    const resigningUserId = socketToUser.get(socket.id);
    const winningUserId = resigningUserId === match.p1.id ? match.p2.id : match.p1.id;
    match.scores[winningUserId] += 2;

    io.to(match.roomName).emit('game:player_resigned', {
      resigningUserId,
      message: 'Opponent surrendered the battle arena.'
    });

    concludeTournament(match);
  });

  // 8. Rematch Request & Acceptance
  socket.on('game:rematch_request', ({ matchId }) => {
    const match = activeMatches.get(matchId);
    if (!match) return;

    const userId = socketToUser.get(socket.id);
    match.rematchVotes[userId] = true;

    const p1Voted = match.rematchVotes[match.p1.id];
    const p2Voted = match.rematchVotes[match.p2.id];

    if (p1Voted && p2Voted) {
      // Both want rematch! Reset match state
      match.currentRound = 1;
      match.roundName = 'ROUND 1';
      match.scores = { [match.p1.id]: 0, [match.p2.id]: 0 };
      match.clashesCount = 0;
      match.roundsPlayed = 0;
      match.rematchVotes = {};
      match.board = Array(9).fill(null);
      match.status = 'connected';

      io.to(match.roomName).emit('game:rematch_agreed', {
        matchId: match.id,
        p1: match.p1,
        p2: match.p2,
        hostId: match.hostId
      });
    } else {
      // Inform opponent about rematch request
      const opponentId = userId === match.p1.id ? match.p2.id : match.p1.id;
      const opponentSession = connectedUsers.get(opponentId);
      if (opponentSession) {
        io.to(opponentSession.socketId).emit('game:rematch_requested_by_opponent', {
          requestingUserId: userId
        });
      }
    }
  });

  // 9. End Game / Exit to Lobby
  socket.on('game:exit_to_lobby', ({ matchId }) => {
    const userId = socketToUser.get(socket.id);
    const userSession = connectedUsers.get(userId);

    if (userSession) {
      userSession.status = 'available';
    }

    const match = activeMatches.get(matchId);
    if (match) {
      io.to(match.roomName).emit('game:player_exited', { userId });
      activeMatches.delete(matchId);
    }

    broadcastLobby();
  });

  // Disconnect Handler
  socket.on('disconnect', () => {
    const userId = socketToUser.get(socket.id);
    if (userId) {
      socketToUser.delete(socket.id);
      const userSession = connectedUsers.get(userId);

      // Handle ongoing challenges
      for (const [chalId, chal] of activeChallenges.entries()) {
        if (chal.challengerId === userId || chal.targetId === userId) {
          clearTimeout(chal.timerId);
          activeChallenges.delete(chalId);
          const otherId = chal.challengerId === userId ? chal.targetId : chal.challengerId;
          const otherSession = connectedUsers.get(otherId);
          if (otherSession) {
            otherSession.status = 'available';
            io.to(otherSession.socketId).emit('challenge:declined', { message: 'Player disconnected.' });
          }
        }
      }

      // Handle ongoing matches
      for (const [mId, match] of activeMatches.entries()) {
        if (match.p1.id === userId || match.p2.id === userId) {
          io.to(match.roomName).emit('game:player_disconnected', {
            disconnectedUserId: userId,
            message: 'Opponent disconnected from the arena.'
          });
          const remainingId = match.p1.id === userId ? match.p2.id : match.p1.id;
          const remainingSession = connectedUsers.get(remainingId);
          if (remainingSession) remainingSession.status = 'available';
          activeMatches.delete(mId);
        }
      }

      connectedUsers.delete(userId);
      broadcastLobby();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`⚡ NEO-TIC ARENA RUNNING AT:`);
  console.log(`   Local Machine:  http://localhost:${PORT}`);
  console.log(`   Same Wi-Fi LAN: http://${localIp}:${PORT}`);
  console.log(`====================================================`);
});
