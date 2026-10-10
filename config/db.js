// db.js
const mysql = require('mysql2');

// Detect environment: Railway sets RAILWAY_ENV=production
const isProd = process.env.RAILWAY_ENV === 'production';

// Use Railway private DB variables in production, local .env variables locally
const dbConfig = isProd
  ? {
      host: process.env.MYSQLHOST,       // Railway private host
      user: process.env.MYSQLUSER,       // Railway MySQL user
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      port: process.env.MYSQLPORT || 3306,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ced_preenrollment',
      port: process.env.DB_PORT || 3306,
    };

let db;

try {
  db = mysql.createPool(dbConfig);
  console.log(`Connected to MySQL (${isProd ? 'Railway' : 'Local'})`);
} catch (err) {
  console.error('DB not initialized:', err);
  db = {
    query: (q, params, cb) => {
      console.error('DB query called but DB is not connected.');
      cb(new Error('DB not connected'), null);
    },
  };
}

module.exports = db;