// Initialize Firebase
const auth = firebase.auth();
const db = firebase.firestore();

// DOM Elements
const addTaskBtn = document.getElementById("addTaskBtn");
const taskContainer = document.getElementById("taskCategories");
const taskModal = document.getElementById("taskModal");
const taskForm = document.getElementById("taskForm");

// State
let tasks = [];
let tasksUnsubscribe = null;
let draggedTask = null;

// Initialize App
function init() {
  if (!addTaskBtn || !taskContainer || !taskModal || !taskForm) {
    console.error("Critical elements not found");
    return;
  }

  setupAuth();
  setupEventListeners();
  loadTheme();
  updateCurrentDate();
}

function setupAuth() {
  auth.onAuthStateChanged((user) => {
    if (user) {
      startTodoApp(user.uid);
    } else {
      window.location.href = "index.html";
    }
  });

  document.querySelector(".logout-btn")?.addEventListener("click", () => {
    auth.signOut();
  });
}

function startTodoApp(userId) {
  if (tasksUnsubscribe) tasksUnsubscribe();

  tasksUnsubscribe = db
    .collection(`users/${userId}/tasks`)
    .orderBy("createdAt", "desc")
    .onSnapshot({
      next: (snapshot) => {
        tasks = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        renderTasks(tasks);
      },
      error: (error) => {
        console.error("Firestore error:", error);
        showError("Error loading tasks. Please refresh.");
      },
    });
}

function renderTasks(tasks) {
  taskContainer.innerHTML = `
    <div class="task-category" data-category="work">
      <h3><span class="icon">💼</span> Work</h3>
      <div class="task-list" id="work-tasks"></div>
    </div>
    <div class="task-category" data-category="personal">
      <h3><span class="icon">🏠</span> Personal</h3>
      <div class="task-list" id="personal-tasks"></div>
    </div>
    <div class="task-category" data-category="hobbies">
      <h3><span class="icon">🎨</span> Hobbies</h3>
      <div class="task-list" id="hobbies-tasks"></div>
    </div>
  `;

  tasks.forEach((task) => {
    const list = document.getElementById(`${task.category}-tasks`);
    if (!list) return;

    const taskEl = document.createElement("div");
    taskEl.className = "task-item";
    taskEl.draggable = true;
    taskEl.dataset.id = task.id;
    taskEl.innerHTML = `
      <div class="task-priority priority-${task.priority}"></div>
      <div class="task-content">
        <div class="task-title">${task.title}</div>
        ${
          task.dueDate
            ? `<div class="task-due">📅 ${formatDate(task.dueDate)}</div>`
            : ""
        }
        ${
          task.description
            ? `<div class="task-description">${task.description}</div>`
            : ""
        }
      </div>
      <div class="task-actions">
        
        <button class="edit-btn" data-id="${task.id}">Edit</button>
        <button class="delete-btn" data-id="${task.id}">Delete</button>
      </div>
    `;

    setupTaskEventListeners(taskEl);
    list.appendChild(taskEl);
  });

  setupDropTargets();
}

function setupTaskEventListeners(taskEl) {
  taskEl.addEventListener("dragstart", handleDragStart);
  taskEl.addEventListener("dragend", handleDragEnd);

  taskEl
    .querySelector(".complete-btn")
    ?.addEventListener("click", handleCompleteTask);
  taskEl.querySelector(".edit-btn")?.addEventListener("click", handleEditTask);
  taskEl
    .querySelector(".delete-btn")
    ?.addEventListener("click", handleDeleteTask);
}

function setupDropTargets() {
  document.querySelectorAll(".task-list").forEach((list) => {
    list.addEventListener("dragover", handleDragOver);
    list.addEventListener("drop", handleDrop);
    list.addEventListener("dragleave", handleDragLeave);
  });
}

// Task Actions
async function handleCompleteTask(e) {
  const taskId = e.target.dataset.id;
  const user = auth.currentUser;
  if (!user) return;

  try {
    await db.doc(`users/${user.uid}/tasks/${taskId}`).update({
      completed: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    showError("Failed to complete task");
    console.error("Complete task error:", error);
  }
}

async function handleDeleteTask(e) {
  if (!confirm("Are you sure you want to delete this task?")) return;
  const taskId = e.target.dataset.id;
  const user = auth.currentUser;
  if (!user) return;

  try {
    await db.doc(`users/${user.uid}/tasks/${taskId}`).delete();
  } catch (error) {
    showError("Failed to delete task");
    console.error("Delete task error:", error);
  }
}

function handleEditTask(e) {
  const taskId = e.target.dataset.id;
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  document.getElementById("taskTitle").value = task.title;
  document.getElementById("taskCategory").value = task.category;
  document.getElementById("taskPriority").value = task.priority;
  document.getElementById("taskDueDate").value = task.dueDate || "";
  document.getElementById("taskDescription").value = task.description || "";
  document.getElementById("taskId").value = task.id;
  document.querySelector(".modal-title").textContent = "Edit Task";

  taskModal.style.display = "block";
}

// Drag and Drop
function handleDragStart(e) {
  draggedTask = tasks.find((t) => t.id === e.target.dataset.id);
  e.target.classList.add("dragging");
  e.dataTransfer.setData("text/plain", e.target.dataset.id);
}

function handleDragEnd(e) {
  e.target.classList.remove("dragging");
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("drop-target");
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove("drop-target");
}

async function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drop-target");

  const taskId = e.dataTransfer.getData("text/plain");
  const newCategory =
    e.currentTarget.closest(".task-category").dataset.category;
  const user = auth.currentUser;
  if (!user || !taskId) return;

  try {
    await db.doc(`users/${user.uid}/tasks/${taskId}`).update({
      category: newCategory,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    showError("Failed to move task");
    console.error("Move task error:", error);
  }
}

// Modal Functions
function setupEventListeners() {
  addTaskBtn.addEventListener("click", () => {
    taskForm.reset();
    document.getElementById("taskId").value = "";
    document.querySelector(".modal-title").textContent = "Add New Task";
    taskModal.style.display = "block";
  });

  document
    .querySelector(".close-btn")
    .addEventListener("click", closeTaskModal);
  taskModal.addEventListener("click", (e) => {
    if (e.target === taskModal) closeTaskModal();
  });

  taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const taskData = {
      title: document.getElementById("taskTitle").value,
      category: document.getElementById("taskCategory").value,
      priority: document.getElementById("taskPriority").value,
      dueDate: document.getElementById("taskDueDate").value || null,
      description: document.getElementById("taskDescription").value || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      completed: false,
    };

    try {
      const taskId = document.getElementById("taskId").value;
      if (taskId) {
        await db.doc(`users/${user.uid}/tasks/${taskId}`).update(taskData);
      } else {
        taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection(`users/${user.uid}/tasks`).add(taskData);
      }
      closeTaskModal();
    } catch (error) {
      showError("Failed to save task");
      console.error("Save task error:", error);
    }
  });
}

function closeTaskModal() {
  taskModal.style.display = "none";
}

// Helper Functions
function formatDate(dateString) {
  if (!dateString) return "";
  const options = { weekday: "short", month: "short", day: "numeric" };
  return new Date(dateString).toLocaleDateString("en-US", options);
}

function updateCurrentDate() {
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  document.getElementById("currentDate").textContent =
    new Date().toLocaleDateString("en-US", options);
}

function showError(message) {
  const errorEl = document.createElement("div");
  errorEl.className = "error-message";
  errorEl.textContent = message;
  document.body.appendChild(errorEl);
  setTimeout(() => errorEl.remove(), 3000);
}

// Theme Functions
function loadTheme() {
  const savedTheme = localStorage.getItem("themePreference") || "light";
  document.body.className = savedTheme + "-theme";

  document.getElementById("themeToggle").addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark-theme");
    document.body.classList.replace(
      isDark ? "dark-theme" : "light-theme",
      isDark ? "light-theme" : "dark-theme"
    );
    localStorage.setItem("themePreference", isDark ? "light" : "dark");
  });
}

// Initialize
document.addEventListener("DOMContentLoaded", init);
