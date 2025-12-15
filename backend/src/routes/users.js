const express = require("express");
const router = express.Router();
const prisma = require("../prisma");

router.get("/", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
    });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, email, role } = req.body || {};
    if (!name || !email) throw new Error("name e email são obrigatórios");
    const user = await prisma.user.create({
      data: {
        name,
        email,
        role: role || "agent",
      },
    });
    res.json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = { router };
