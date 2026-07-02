// Creates (or upgrades) the Algfolded tables on the Hostpoint MariaDB.
// Usage: set MYSQL_* env vars (see .env.example), then `node scripts/setup_db.mjs`.
import mysql from 'mysql2/promise'

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wca_account_id INT NOT NULL UNIQUE,
    wca_id VARCHAR(16) NULL,
    wca_name VARCHAR(255) NOT NULL,
    wca_avatar_url VARCHAR(512) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS user_sessions (
    token CHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sessions_user (user_id),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS solves (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    client_id VARCHAR(36) NOT NULL,
    algset VARCHAR(32) NOT NULL,
    case_key VARCHAR(64) NOT NULL,
    ms INT NOT NULL,
    scramble VARCHAR(255) NULL,
    alg_used VARCHAR(255) NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'timer',
    solved_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_solves_user_client (user_id, client_id),
    INDEX idx_solves_user_set_case (user_id, algset, case_key),
    CONSTRAINT fk_solves_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS user_case_algs (
    user_id INT NOT NULL,
    algset VARCHAR(32) NOT NULL,
    case_key VARCHAR(64) NOT NULL,
    alg VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, algset, case_key),
    CONSTRAINT fk_case_algs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,
]

const main = async () => {
  const host = process.env.MYSQL_HOST
  if (!host) {
    console.error('MYSQL_HOST is not set — see .env.example')
    process.exit(1)
  }
  const conn = await mysql.createConnection({
    host,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT ?? 3306),
    charset: 'utf8mb4',
    ssl: { rejectUnauthorized: false },
  })
  for (const sql of statements) {
    const table = sql.match(/EXISTS (\w+)/)?.[1]
    await conn.query(sql)
    console.log(`ok: ${table}`)
  }
  await conn.end()
  console.log('Database setup complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
