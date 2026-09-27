const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { io: Client } = require('socket.io-client');

// Fast timing and isolated database for tests
process.env.COUNTDOWN_MS = '60';
process.env.CONCLUDE_DELAY_MS = '60';
process.env.ROUND_DELAY_MS = '60';
process.env.CLASH_DELAY_MS = '60';

const testDbPath = path.join(__dirname, 'test_sockets_arena.db');
process.env.DATABASE_PATH = testDbPath;

const { server } = require('../server');

let testPort;
let serverUrl;

function createClientSocket() {
  return Client(serverUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });
}

function waitForEvent(socket, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for socket event: "${eventName}" after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('Real-Time Multiplayer & Socket.io Lifecycle (server.js)', () => {
  let client1;
  let client2;
  let user1Data;
  let user2Data;
  let currentMatchId;

  before(async () => {
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        testPort = server.address().port;
        serverUrl = `http://127.0.0.1:${testPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (client1 && client1.connected) client1.disconnect();
    if (client2 && client2.connected) client2.disconnect();
    await new Promise((resolve) => {
      server.close(() => {
        try {
          if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        } catch (e) {}
        resolve();
      });
    });
  });

  test('Clients can connect and register user identities', async () => {
    client1 = createClientSocket();
    client2 = createClientSocket();

    await Promise.all([
      waitForEvent(client1, 'connect'),
      waitForEvent(client2, 'connect')
    ]);

    assert.ok(client1.connected);
    assert.ok(client2.connected);

    // Register Player 1
    const p1RegPromise = waitForEvent(client1, 'user:registered');
    client1.emit('user:register', { username: 'ViperX', avatar: 'cyber_ninja' });
    const regResult1 = await p1RegPromise;

    assert.ok(regResult1.user);
    assert.strictEqual(regResult1.user.username, 'ViperX');
    assert.strictEqual(regResult1.user.avatar, 'cyber_ninja');
    user1Data = regResult1.user;

    // Register Player 2
    const p2RegPromise = waitForEvent(client2, 'user:registered');
    client2.emit('user:register', { username: 'TitanY', avatar: 'mecha_core' });
    const regResult2 = await p2RegPromise;

    assert.ok(regResult2.user);
    assert.strictEqual(regResult2.user.username, 'TitanY');
    user2Data = regResult2.user;
  });

  test('Lobby broadcast broadcasts active online players to all connected sockets', async () => {
    const lobbyPromise = waitForEvent(client1, 'lobby:update');
    client1.emit('lobby:refresh');
    const players = await lobbyPromise;

    assert.ok(Array.isArray(players));
    const usernames = players.map(p => p.username);
    assert.ok(usernames.includes('ViperX'));
    assert.ok(usernames.includes('TitanY'));
  });

  test('Player 1 challenges Player 2, and Player 2 accepts challenge', async () => {
    const incomingPromise = waitForEvent(client2, 'challenge:incoming');
    client1.emit('challenge:send', { targetUserId: user2Data.id });
    const incomingData = await incomingPromise;

    assert.strictEqual(incomingData.challenger.username, 'ViperX');
    assert.ok(incomingData.challengeId);

    // Player 2 accepts
    const p1ConnectedPromise = waitForEvent(client1, 'match:connected');
    const p2ConnectedPromise = waitForEvent(client2, 'match:connected');

    client2.emit('challenge:respond', {
      challengeId: incomingData.challengeId,
      accepted: true
    });

    const [match1, match2] = await Promise.all([p1ConnectedPromise, p2ConnectedPromise]);
    assert.strictEqual(match1.matchId, match2.matchId);
    assert.strictEqual(match1.p1.id, user1Data.id);
    assert.strictEqual(match1.p2.id, user2Data.id);

    currentMatchId = match1.matchId;
  });

  test('Host selects symbol X and symbols are synchronized', async () => {
    const symbolsPromise1 = waitForEvent(client1, 'match:symbols_assigned');
    const symbolsPromise2 = waitForEvent(client2, 'match:symbols_assigned');

    client1.emit('match:choose_symbol', {
      matchId: currentMatchId,
      chosenSymbol: 'X'
    });

    const [s1, s2] = await Promise.all([symbolsPromise1, symbolsPromise2]);
    assert.strictEqual(s1.p1.symbol, 'X');
    assert.strictEqual(s1.p2.symbol, 'O');
    assert.strictEqual(s1.startingUserId, user1Data.id);
  });

  test('Countdown starts and transitions match to playing state', async () => {
    const countdownPromise = waitForEvent(client1, 'match:countdown_start');
    const roundStartPromise = waitForEvent(client1, 'game:round_start');

    client1.emit('match:start_countdown', { matchId: currentMatchId });

    const countdown = await countdownPromise;
    assert.strictEqual(countdown.durationSeconds, 5);

    const roundStart = await roundStartPromise;
    assert.strictEqual(roundStart.currentRound, 1);
    assert.strictEqual(roundStart.currentTurn, user1Data.id);
    assert.strictEqual(roundStart.board.length, 9);
  });

  test('Move validation: reject invalid moves and accept valid moves', async () => {
    // Attempt invalid move by Player 2 (it is Player 1's turn)
    const rejectPromise = waitForEvent(client2, 'game:move_rejected');
    client2.emit('game:make_move', { matchId: currentMatchId, index: 4 });
    const rejection = await rejectPromise;
    assert.ok(rejection.reason.includes('turn'));

    // Valid move by Player 1 in slot 0
    const movePromise1 = waitForEvent(client1, 'game:move_success');
    client1.emit('game:make_move', { matchId: currentMatchId, index: 0 });
    const moveRes1 = await movePromise1;
    assert.strictEqual(moveRes1.index, 0);
    assert.strictEqual(moveRes1.symbol, 'X');
    assert.strictEqual(moveRes1.nextTurn, user2Data.id);

    // Reject move on already claimed slot 0
    const slotRejectPromise = waitForEvent(client2, 'game:move_rejected');
    client2.emit('game:make_move', { matchId: currentMatchId, index: 0 });
    const slotRejection = await slotRejectPromise;
    assert.ok(slotRejection.reason.includes('already claimed'));
  });

  test('Round victory: three in a row wins round and increments score', async () => {
    // P2 moves to 3
    const p2Move = waitForEvent(client1, 'game:move_success');
    client2.emit('game:make_move', { matchId: currentMatchId, index: 3 });
    await p2Move;

    // P1 moves to 1
    const p1Move1 = waitForEvent(client1, 'game:move_success');
    client1.emit('game:make_move', { matchId: currentMatchId, index: 1 });
    await p1Move1;

    // P2 moves to 4
    const p2Move2 = waitForEvent(client1, 'game:move_success');
    client2.emit('game:make_move', { matchId: currentMatchId, index: 4 });
    await p2Move2;

    // P1 moves to 2 -> Completes combo [0, 1, 2]!
    const roundWonPromise = waitForEvent(client1, 'game:round_won');
    client1.emit('game:make_move', { matchId: currentMatchId, index: 2 });
    const roundWon = await roundWonPromise;

    assert.strictEqual(roundWon.winnerId, user1Data.id);
    assert.strictEqual(roundWon.scores[user1Data.id], 1);
    assert.deepStrictEqual(roundWon.winningCombo, [0, 1, 2]);
  });

  test('Surrender/resignation awards victory to opponent and triggers tournament conclusion', async () => {
    const resignedPromise = waitForEvent(client2, 'game:player_resigned');
    const conclusionPromise = waitForEvent(client2, 'game:tournament_concluded');

    client1.emit('game:resign', { matchId: currentMatchId });

    const [resignedData, conclusionData] = await Promise.all([resignedPromise, conclusionPromise]);

    assert.strictEqual(resignedData.resigningUserId, user1Data.id);
    assert.strictEqual(conclusionData.winnerId, user2Data.id);
    assert.strictEqual(conclusionData.winnerName, 'TitanY');
  });

  test('Rematch request and mutual agreement resets the match room with a new ID', async () => {
    const oppNotificationPromise = waitForEvent(client2, 'game:rematch_requested_by_opponent');
    client1.emit('game:rematch_request', { matchId: currentMatchId });
    await oppNotificationPromise;

    // Client 2 also requests rematch -> agreed!
    const rematchAgreed1 = waitForEvent(client1, 'game:rematch_agreed');
    const rematchAgreed2 = waitForEvent(client2, 'game:rematch_agreed');

    client2.emit('game:rematch_request', { matchId: currentMatchId });

    const [r1, r2] = await Promise.all([rematchAgreed1, rematchAgreed2]);
    assert.strictEqual(r1.matchId, r2.matchId);
    assert.notStrictEqual(r1.matchId, currentMatchId, 'Rematch should produce a fresh match ID');
    currentMatchId = r1.matchId;
  });

  test('Exit to lobby resets player status and notifies room', async () => {
    const playerExitedPromise = waitForEvent(client2, 'game:player_exited');
    client1.emit('game:exit_to_lobby', { matchId: currentMatchId });
    const exitedData = await playerExitedPromise;
    assert.strictEqual(exitedData.userId, user1Data.id);
  });
});
