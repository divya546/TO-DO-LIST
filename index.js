// backend of task manager
const express = require('express');
const cors = require("cors");
const mongoose = require("mongoose");
const { UserModel, toDoModel } = require("./db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const nodemailer = require('nodemailer');
const path = require("path");

require('dotenv').config();

const app = express();
const JWT_SECRET = process.env.TOKEN;

mongoose.connect(process.env.MONGOOSE_URL)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log("MongoDB connection error:", err));

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

const otpVerified = {};
const otpStore = {};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend/signin/index.html"));
});

// ================= SEND OTP =================
app.post('/send-otp', async (req, res) => {
    const zmail = z.object({ email: z.string().email() });
    const parsedEmail = zmail.safeParse(req.body);

    if (!parsedEmail.success) {
        return res.status(422).json({ message: "Invalid email format", error: parsedEmail.error });
    }

    const email = parsedEmail.data.email;
    const otp = Math.floor(100000 + Math.random() * 900000);
    const expiresAt = Date.now() + 300000; // 5 minutes
    otpStore[email] = { otp, expiresAt };

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your OTP is:',
        text: `Your OTP code is ${otp}. Valid for 5 minutes.`
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`OTP sent to ${email}: ${info.response}`);
        return res.status(200).json({ message: "OTP Successfully sent!" });
    } catch (err) {
        console.error("Error sending OTP:", err);
        return res.status(500).json({ message: "Failed to send OTP. Check EMAIL_USER and EMAIL_PASS." });
    }
});

// ================= VERIFY OTP =================
app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP required" });

    const otpData = otpStore[email];
    if (!otpData) return res.status(400).json({ message: "OTP not found. Request a new one." });

    if (Date.now() > otpData.expiresAt) return res.status(400).json({ message: "OTP expired. Request a new one." });
    if (otpData.otp != parseInt(otp)) return res.status(400).json({ message: "Incorrect OTP." });

    otpVerified[email] = true;
    return res.status(200).json({ message: "OTP is correct" });
});

// ================= REGISTER =================
app.post('/register', async (req, res) => {
    const schema = z.object({
        name: z.string().max(100),
        email: z.string().min(6).email().max(100),
        password: z.string()
            .min(6)
            .max(50)
            .regex(/[A-Z]/, "Password should have at least one uppercase letter")
            .regex(/[a-z]/, "Password should have at least one lowercase letter")
            .regex(/[^A-Za-z0-9]/, "Password should have at least one special character")
    });

    const parsedData = schema.safeParse(req.body);
    if (!parsedData.success) return res.status(400).json({ message: "Invalid format", error: parsedData.error });

    const { name, email, password } = parsedData.data;

    try {
        const userExists = await UserModel.findOne({ email });
        if (userExists) return res.status(409).json({ message: "User already exists." });
        if (!otpVerified[email]) return res.status(422).json({ message: "OTP not verified." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await UserModel.create({ name, email, password: hashedPassword });
        delete otpVerified[email];

        return res.status(200).json({ message: "Successfully Registered!" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Unable to register." });
    }
});

// ================= LOGIN =================
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await UserModel.findOne({ email });
        if (!user) return res.status(403).json({ message: "Incorrect credentials" });

        const passwordMatched = await bcrypt.compare(password, user.password);
        if (!passwordMatched) return res.status(403).json({ message: "Incorrect credentials" });

        const token = jwt.sign({ id: user._id }, JWT_SECRET);
        return res.status(200).json({ message: "Login Successful", token });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Login failed due to some issue." });
    }
});

// ================= TODO ROUTES =================
app.get("/getTodo", async (req, res) => {
    const rawToken = req.headers['authorization'];
    const token = rawToken?.split(' ')[1];
    if (!token) return res.status(401).json({ message: "JWT token not provided" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const todos = await toDoModel.find({ userId: decoded.id });
        if (todos.length > 0) return res.status(200).json({ todos });
        return res.status(200).json({ message: "No todos found" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error fetching todos" });
    }
});

app.post('/addToDo', async (req, res) => {
    const { title } = req.body;
    const rawToken = req.headers['authorization'];
    const token = rawToken?.startsWith("Bearer ") ? rawToken.split(" ")[1] : rawToken;
    if (!token) return res.status(400).json({ message: "No token provided. Login again!" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const todo = await toDoModel.create({ title, done: false, userId: decoded.id });
        return res.status(200).json({ message: "Successfully added", todo });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error adding todo" });
    }
});

app.delete('/delete', async (req, res) => {
    const { id } = req.body;
    const rawToken = req.headers['authorization'];
    const token = rawToken?.startsWith('Bearer ') ? rawToken.split(" ")[1] : rawToken;
    if (!token) return res.status(400).json({ message: "Token not found." });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        await toDoModel.deleteOne({ _id: id, userId: decoded.id });
        return res.status(200).json({ message: "Todo deleted successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error deleting todo" });
    }
});

app.put("/edit", async (req, res) => {
    const { id, title } = req.body;
    const rawToken = req.headers['authorization'];
    const token = rawToken?.startsWith("Bearer ") ? rawToken.split(" ")[1] : rawToken;
    if (!token) return res.status(400).json({ message: "Token not found." });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        await toDoModel.updateOne({ _id: id, userId: decoded.id }, { $set: { title } });
        return res.status(200).json({ message: "Updated successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error updating todo" });
    }
});

app.listen(3000, () => {
    console.log("App is running on http://localhost:3000");
});
