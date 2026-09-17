const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'arena_game.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new DatabaseSync(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    avatar TEXT DEFAULT 'cyber_ninja',
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    matches_played INTEGER DEFAULT 0,
    rating INTEGER DEFAULT 1000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    player1_id TEXT NOT NULL,
    player2_id TEXT NOT NULL,
    player1_name TEXT NOT NULL,
    player2_name TEXT NOT NULL,
    winner_id TEXT,
    winner_name TEXT,
    p1_score INTEGER DEFAULT 0,
    p2_score INTEGER DEFAULT 0,
    rounds_played INTEGER DEFAULT 0,
    clashes_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    badge_title TEXT NOT NULL,
    badge_desc TEXT NOT NULL,
    icon TEXT NOT NULL,
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, badge_id)
  );
`);

const BADGE_DEFINITIONS = {
  first_blood: {
    title: 'First Blood',
    desc: 'Win your first tournament round in the Arena',
    icon: '⚡'
  },
  tactical_master: {
    title: 'Tactical Champion',
    desc: 'Emerge victorious in a full 3-round tournament',
    icon: '🏆'
  },
  flawless_victory: {
    title: 'Flawless Dominance',
    desc: 'Win a match without dropping a single round (2-0)',
    icon: '👑'
  },
  clash_survivor: {
    title: 'Clash Survivor',
    desc: 'Win a tournament that underwent a draw / clash replay',
    icon: '🛡️'
  },
  seasoned_warrior: {
    title: 'Seasoned Gladiator',
    desc: 'Complete 3 tournament matches',
    icon: '⚔️'
  },
  legend: {
    title: 'Arena Legend',
    desc: 'Win 5 tournament championships',
    icon: '🌟'
  }
};

function findOrCreateUser(username, avatar = 'cyber_ninja') {
  const cleanName = (username || '').trim().substring(0, 16);
  if (!cleanName) return null;

  const existing = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(cleanName);
  if (existing) {
    db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP, avatar = ? WHERE id = ?').run(avatar, existing.id);
    return getUser(existing.id);
  }

  const id = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  db.prepare(`
    INSERT INTO users (id, username, avatar, wins, losses, draws, matches_played, rating)
    VALUES (?, ?, ?, 0, 0, 0, 0, 1000)
  `).run(id, cleanName, avatar);

  return getUser(id);
}

function getUser(id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return null;
  const achievements = getUserAchievements(id);
  return { ...user, achievements };
}

function getUserAchievements(userId) {
  return db.prepare('SELECT badge_id, badge_title, badge_desc, icon, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC').all(userId);
}

function getLeaderboard(limit = 10) {
  return db.prepare(`
    SELECT id, username, avatar, wins, losses, draws, matches_played, rating
    FROM users
    ORDER BY wins DESC, rating DESC, matches_played DESC
    LIMIT ?
  `).all(limit);
}

function getRecentMatches(limit = 10) {
  return db.prepare(`
    SELECT * FROM matches
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}

function unlockAchievement(userId, badgeId) {
  const badge = BADGE_DEFINITIONS[badgeId];
  if (!badge) return null;
  try {
    db.prepare(`
      INSERT OR IGNORE INTO achievements (user_id, badge_id, badge_title, badge_desc, icon)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, badgeId, badge.title, badge.desc, badge.icon);
    return badge;
  } catch (e) {
    return null;
  }
}

function recordMatch({ matchId, p1, p2, p1Score, p2Score, winnerId, clashesCount, roundsPlayed }) {
  const isP1Winner = winnerId === p1.id;
  const isP2Winner = winnerId === p2.id;
  const winnerName = isP1Winner ? p1.username : (isP2Winner ? p2.username : 'Draw');

  // Insert match record
  db.prepare(`
    INSERT INTO matches (id, player1_id, player2_id, player1_name, player2_name, winner_id, winner_name, p1_score, p2_score, rounds_played, clashes_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(matchId, p1.id, p2.id, p1.username, p2.username, winnerId || null, winnerName, p1Score, p2Score, roundsPlayed, clashesCount || 0);

  // Update Player 1 stats
  const p1RatingDelta = isP1Winner ? 25 : (isP2Winner ? -15 : 5);
  db.prepare(`
    UPDATE users SET
      wins = wins + ?,
      losses = losses + ?,
      draws = draws + ?,
      matches_played = matches_played + 1,
      rating = MAX(500, rating + ?)
    WHERE id = ?
  `).run(isP1Winner ? 1 : 0, isP2Winner ? 1 : 0, (!isP1Winner && !isP2Winner) ? 1 : 0, p1RatingDelta, p1.id);

  // Update Player 2 stats
  const p2RatingDelta = isP2Winner ? 25 : (isP1Winner ? -15 : 5);
  db.prepare(`
    UPDATE users SET
      wins = wins + ?,
      losses = losses + ?,
      draws = draws + ?,
      matches_played = matches_played + 1,
      rating = MAX(500, rating + ?)
    WHERE id = ?
  `).run(isP2Winner ? 1 : 0, isP1Winner ? 1 : 0, (!isP1Winner && !isP2Winner) ? 1 : 0, p2RatingDelta, p2.id);

  // Check achievements for winner & participants
  const newAchievements = { p1: [], p2: [] };

  const updatedP1 = getUser(p1.id);
  const updatedP2 = getUser(p2.id);

  if (p1Score > 0) {
    if (unlockAchievement(p1.id, 'first_blood')) newAchievements.p1.push(BADGE_DEFINITIONS.first_blood);
  }
  if (p2Score > 0) {
    if (unlockAchievement(p2.id, 'first_blood')) newAchievements.p2.push(BADGE_DEFINITIONS.first_blood);
  }

  if (isP1Winner) {
    if (unlockAchievement(p1.id, 'tactical_master')) newAchievements.p1.push(BADGE_DEFINITIONS.tactical_master);
    if (p2Score === 0) {
      if (unlockAchievement(p1.id, 'flawless_victory')) newAchievements.p1.push(BADGE_DEFINITIONS.flawless_victory);
    }
    if ((clashesCount || 0) > 0) {
      if (unlockAchievement(p1.id, 'clash_survivor')) newAchievements.p1.push(BADGE_DEFINITIONS.clash_survivor);
    }
    if (updatedP1.wins >= 5) {
      if (unlockAchievement(p1.id, 'legend')) newAchievements.p1.push(BADGE_DEFINITIONS.legend);
    }
  } else if (isP2Winner) {
    if (unlockAchievement(p2.id, 'tactical_master')) newAchievements.p2.push(BADGE_DEFINITIONS.tactical_master);
    if (p1Score === 0) {
      if (unlockAchievement(p2.id, 'flawless_victory')) newAchievements.p2.push(BADGE_DEFINITIONS.flawless_victory);
    }
    if ((clashesCount || 0) > 0) {
      if (unlockAchievement(p2.id, 'clash_survivor')) newAchievements.p2.push(BADGE_DEFINITIONS.clash_survivor);
    }
    if (updatedP2.wins >= 5) {
      if (unlockAchievement(p2.id, 'legend')) newAchievements.p2.push(BADGE_DEFINITIONS.legend);
    }
  }

  if (updatedP1.matches_played >= 3) {
    if (unlockAchievement(p1.id, 'seasoned_warrior')) newAchievements.p1.push(BADGE_DEFINITIONS.seasoned_warrior);
  }
  if (updatedP2.matches_played >= 3) {
    if (unlockAchievement(p2.id, 'seasoned_warrior')) newAchievements.p2.push(BADGE_DEFINITIONS.seasoned_warrior);
  }

  return {
    match: db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId),
    p1: updatedP1,
    p2: updatedP2,
    newAchievements
  };
}

module.exports = {
  findOrCreateUser,
  getUser,
  getLeaderboard,
  getRecentMatches,
  getUserAchievements,
  recordMatch
};
