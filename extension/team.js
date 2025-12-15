
// Toast Notification System
function showToast(message, duration = 3000) {
    let toast = document.createElement('div');
    toast.innerText = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '30px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(40, 40, 50, 0.95)';
    toast.style.color = '#fff';
    toast.style.padding = '10px 22px';
    toast.style.borderRadius = '7px';
    toast.style.zIndex = 99999;
    toast.style.fontSize = '15px';
    toast.style.boxShadow = '0 2px 12px rgba(0,0,0,0.16)';
    document.body.appendChild(toast);
    setTimeout(()=>{toast.remove();}, duration);
}



let backendUrl = "";
let extensionKey = "";

const usersTableBody = document.querySelector("#usersTable tbody");
const tasksTableBody = document.querySelector("#tasksTable tbody");
const taskTitleEl = document.getElementById("taskTitle");
const taskDealIdEl = document.getElementById("taskDealId");
const taskUserIdEl = document.getElementById("taskUserId");
const taskDueAtEl = document.getElementById("taskDueAt");
const createTaskBtn = document.getElementById("createTask");

const userNameEl = document.getElementById("userName");
const userEmailEl = document.getElementById("userEmail");
const userRoleEl = document.getElementById("userRole");
const createUserBtn = document.getElementById("createUser");

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["backendUrl", "extensionKey"], (data) => {
      backendUrl = data.backendUrl || "";
      extensionKey = data.extensionKey || "";
      resolve();
    });
  });
}

async function fetchJson(path, options = {}) {
  if (!backendUrl) return [];
  const res = await fetch(`${backendUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "x-extension-key": extensionKey || ""
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.warn("Erro em", path, res.status, txt);
    return [];
  }
  return res.json();
}

function renderUsers(users) {
  usersTableBody.innerHTML = "";
  users.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>`;
    usersTableBody.appendChild(tr);
  });
}

function renderTasks(tasks) {
  tasksTableBody.innerHTML = "";
  tasks.forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.title}</td>
      <td>${t.dealName || ""}</td>
      <td>${t.assigneeName || ""}</td>
      <td>${t.dueAt ? new Date(t.dueAt).toLocaleString() : ""}</td>
      <td>${t.status}</td>
    `;
    tasksTableBody.appendChild(tr);
  });
}

async function loadData() {
  const users = await fetchJson("/users");
  const tasks = await fetchJson("/tasks");
  renderUsers(users);
  renderTasks(tasks);
}

async function createTask() {
  if (!backendUrl) {
    showToast("Configure o backend nas opções da extensão.");
    return;
  }
  const payload = {
    title: taskTitleEl.value.trim(),
    dealId: taskDealIdEl.value.trim() || null,
    dealExternalId: null,
    assigneeId: taskUserIdEl.value.trim() || null,
    dueAt: taskDueAtEl.value.trim() || null
  };
  if (!payload.title || !payload.dealId) {
    showToast("Preencha título e Deal ID.");
    return;
  }
  const res = await fetch(`${backendUrl}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-extension-key": extensionKey || ""
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const t = await res.text();
    showToast("Erro ao criar tarefa: " + t);
    return;
  }
  taskTitleEl.value = "";
  taskDealIdEl.value = "";
  taskUserIdEl.value = "";
  taskDueAtEl.value = "";
  await loadData();
}

async function createUser() {
  if (!backendUrl) {
    showToast("Configure o backend nas opções da extensão.");
    return;
  }
  const name = userNameEl.value.trim();
  const email = userEmailEl.value.trim();
  const role = userRoleEl.value || "agent";
  if (!name || !email) {
    showToast("Preencha nome e email.");
    return;
  }
  const res = await fetch(`${backendUrl}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-extension-key": extensionKey || ""
    },
    body: JSON.stringify({ name, email, role })
  });
  if (!res.ok) {
    const t = await res.text();
    showToast("Erro ao criar usuário: " + t);
    return;
  }
  userNameEl.value = "";
  userEmailEl.value = "";
  userRoleEl.value = "agent";
  await loadData();
}

createTaskBtn.addEventListener("click", () => createTask());
createUserBtn.addEventListener("click", () => createUser());

(async () => {
  await loadConfig();
  await loadData();
})();
