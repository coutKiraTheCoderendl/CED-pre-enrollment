// config/itDb.js
// Read-only connection to the IT department database (CED view only)
const mysql = require('mysql2');

const itDbConfig = {
    host: process.env.IT_DB_HOST || 'localhost',
    user: process.env.IT_DB_USER || 'ced_ReadOnly',
    password: process.env.IT_DB_PASSWORD,
    database: process.env.IT_DB_NAME || 'it_department',
    port: process.env.IT_DB_PORT || 3306,
};

const itDb = mysql.createPool(itDbConfig);

module.exports = itDb;