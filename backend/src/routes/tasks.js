const express = require("express");
const router = express.Router();
const { listTasks, createTask, listDueSoon } = require("../services/taskService");

router.get("/", async (req, res) => {
  try {
    const tasks = await listTasks();
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const task = await createTask(req.body || {});
    res.json(task);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/due-soon", async (req, res) => {
  try {
    const mins = parseInt(req.query.minutes || "10", 10);
    const tasks = await listDueSoon(mins);
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router };
