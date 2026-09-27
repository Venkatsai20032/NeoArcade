const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Set test database path before requiring db module
const testDbPath = path.join(__dirname, 'test_arena_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6) + '.db');
process.env.DATABASE_PATH = testDbPath;

const db = require('../db');

describe('Database & Persistence Layer (db.js)', () => {
  after(() => {
    // Clean up test database file if needed
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (e) {
      // ignore
    }
  });

  test('findOrCreateUser creates a new user with valid initial stats', () => {
    const user = db.findOrCreateUser('ShadowBlade', 'cyber_ninja');
    assert.ok(user, 'User should be created');
    assert.strictEqual(user.username, 'ShadowBlade');
    assert.strictEqual(user.avatar, 'cyber_ninja');
    assert.strictEqual(user.wins, 0);
    assert.strictEqual(user.losses, 0);
    assert.strictEqual(user.draws, 0);
    assert.strictEqual(user.matches_played, 0);
    assert.strictEqual(user.rating, 1000);
    assert.ok(Array.isArray(user.achievements), 'Achievements should be an array');
    assert.strictEqual(user.achievements.length, 0);
  });

  test('findOrCreateUser is case-insensitive and trims whitespace', () => {
    const user1 = db.findOrCreateUser('  CyberNeo  ', 'mecha_core');
    assert.strictEqual(user1.username, 'CyberNeo');

    const user2 = db.findOrCreateUser('cyberneo', 'neon_valkyrie');
    assert.strictEqual(user2.id, user1.id, 'Should return existing user ID');
    assert.strictEqual(user2.avatar, 'neon_valkyrie', 'Avatar should be updated');
  });

  test('findOrCreateUser truncates usernames longer than 16 chars and rejects empty', () => {
    const longName = 'SuperUltraMegaLongGamerTag';
    const truncated = db.findOrCreateUser(longName, 'cyber_ninja');
    assert.strictEqual(truncated.username.length, 16);
    assert.strictEqual(truncated.username, longName.substring(0, 16));

    const emptyUser = db.findOrCreateUser('   ', 'cyber_ninja');
    assert.strictEqual(emptyUser, null, 'Empty username should return null');
  });

  test('getUser retrieves existing user or returns null', () => {
    const created = db.findOrCreateUser('GhostRider', 'glitch_wraith');
    const fetched = db.getUser(created.id);
    assert.ok(fetched);
    assert.strictEqual(fetched.id, created.id);
    assert.strictEqual(fetched.username, 'GhostRider');

    const nonExistent = db.getUser('invalid_id_9999');
    assert.strictEqual(nonExistent, null);
  });

  test('recordMatch updates player statistics and rating appropriately', () => {
    const p1 = db.findOrCreateUser('Gladiator1', 'cyber_ninja');
    const p2 = db.findOrCreateUser('Gladiator2', 'mecha_core');

    const matchId = 'match_test_' + Date.now();
    const result = db.recordMatch({
      matchId,
      p1,
      p2,
      p1Score: 2,
      p2Score: 0,
      winnerId: p1.id,
      clashesCount: 0,
      roundsPlayed: 2
    });

    assert.ok(result);
    assert.ok(result.match);
    assert.strictEqual(result.match.id, matchId);
    assert.strictEqual(result.match.winner_id, p1.id);
    assert.strictEqual(result.match.p1_score, 2);
    assert.strictEqual(result.match.p2_score, 0);

    // Verify P1 stats
    assert.strictEqual(result.p1.wins, 1);
    assert.strictEqual(result.p1.losses, 0);
    assert.strictEqual(result.p1.matches_played, 1);
    assert.strictEqual(result.p1.rating, 1025); // 1000 + 25

    // Verify P2 stats
    assert.strictEqual(result.p2.wins, 0);
    assert.strictEqual(result.p2.losses, 1);
    assert.strictEqual(result.p2.matches_played, 1);
    assert.strictEqual(result.p2.rating, 985); // 1000 - 15

    // Verify achievements unlocked
    const p1Badges = result.newAchievements.p1.map(b => b.title);
    assert.ok(p1Badges.includes('First Blood'), 'P1 should get First Blood');
    assert.ok(p1Badges.includes('Tactical Champion'), 'P1 should get Tactical Champion');
    assert.ok(p1Badges.includes('Flawless Dominance'), 'P1 should get Flawless Dominance for 2-0');
  });

  test('recordMatch is idempotent: duplicate calls do not double-increment stats', () => {
    const p1 = db.findOrCreateUser('IdemP1', 'apex_hunter');
    const p2 = db.findOrCreateUser('IdemP2', 'quantum_phoenix');

    const matchId = 'match_idem_' + Date.now();
    const firstCall = db.recordMatch({
      matchId,
      p1,
      p2,
      p1Score: 2,
      p2Score: 1,
      winnerId: p1.id,
      clashesCount: 0,
      roundsPlayed: 3
    });

    assert.strictEqual(firstCall.p1.wins, 1);

    const secondCall = db.recordMatch({
      matchId,
      p1,
      p2,
      p1Score: 2,
      p2Score: 1,
      winnerId: p1.id,
      clashesCount: 0,
      roundsPlayed: 3
    });

    assert.strictEqual(secondCall.p1.wins, 1, 'Wins must not increment again');
    assert.strictEqual(secondCall.p1.rating, firstCall.p1.rating, 'Rating must not change again');
  });

  test('clash_survivor achievement unlocks when match has clash draw count > 0', () => {
    const p1 = db.findOrCreateUser('ClashP1', 'cyber_ninja');
    const p2 = db.findOrCreateUser('ClashP2', 'mecha_core');

    const matchId = 'match_clash_' + Date.now();
    const result = db.recordMatch({
      matchId,
      p1,
      p2,
      p1Score: 2,
      p2Score: 1,
      winnerId: p1.id,
      clashesCount: 1,
      roundsPlayed: 3
    });

    const p1Badges = result.newAchievements.p1.map(b => b.title);
    assert.ok(p1Badges.includes('Clash Survivor'), 'P1 should receive Clash Survivor badge');
  });

  test('getLeaderboard returns top players sorted by wins, rating, matches', () => {
    const leaders = db.getLeaderboard(5);
    assert.ok(Array.isArray(leaders));
    assert.ok(leaders.length > 0);
    for (let i = 0; i < leaders.length - 1; i++) {
      assert.ok(leaders[i].wins >= leaders[i + 1].wins, 'Leaderboard must sort descending by wins');
    }
  });

  test('getRecentMatches returns recently completed matches', () => {
    const matches = db.getRecentMatches(5);
    assert.ok(Array.isArray(matches));
    assert.ok(matches.length > 0);
    assert.ok(matches[0].id);
    assert.ok(matches[0].player1_name);
    assert.ok(matches[0].player2_name);
  });
});
