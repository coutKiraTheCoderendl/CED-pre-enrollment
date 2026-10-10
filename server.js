// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const authRouter = require('./routes/auth');

const app = express();

// -------------------- Middleware --------------------
app.use(cors({
  origin: [
    'http://localhost:5000', 
    'https://ced-pre-enrollment-production.up.railway.app'
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public')); // Serve static HTML/CSS/JS/images

// -------------------- Auth Route --------------------
app.use('/api/auth', authRouter);

// -------------------- DB Connection --------------------
try {
    const db = require('./config/db'); 
    console.log('DB module loaded');
} catch (err) {
    console.error('DB connection failed or missing. Continuing without DB.', err);
}

// -------------------- Other API Routes --------------------
try { app.use('/api/students', require('./routes/students')); } 
catch(err) { console.error('Failed to load students route:', err); }

try { app.use('/api/teachers', require('./routes/teachers')); } 
catch(err) { console.error('Failed to load teachers route:', err); }

try { app.use('/api/admin', require('./routes/admin')); } 
catch(err) { console.error('Failed to load admin route:', err); }

try { app.use('/api/admin', require('./routes/itSync')); }
catch(err) { console.error('Failed to load IT sync route:', err); }

// -------------------- Frontend Routes --------------------
// Serve login page at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// -------------------- Start Server --------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});