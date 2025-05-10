// Initialize Firebase
const auth = firebase.auth();
const db = firebase.firestore();

// DOM Elements
const addGoalBtn = document.getElementById("addGoalBtn");
const goalModal = document.getElementById("goalModal");
const goalForm = document.getElementById("goalForm");
const personalGoalsList = document.getElementById("personal-goals");
const academicGoalsList = document.getElementById("academic-goals");
const careerGoalsList = document.getElementById("career-goals");

// State
let goals = [];
let goalsUnsubscribe = null;

// Initialize App
function init() {
  setupAuth();
  setupEventListeners();
  loadTheme();
  updateCurrentDate();
}

function setupAuth() {
  auth.onAuthStateChanged((user) => {
    if (user) {
      startGoalsApp(user.uid);
    } else {
      window.location.href = "index.html";
    }
  });

  document.querySelector(".logout-btn")?.addEventListener("click", () => {
    auth.signOut();
  });
}

function startGoalsApp(userId) {
  if (goalsUnsubscribe) goalsUnsubscribe();

  goalsUnsubscribe = db
    .collection(`users/${userId}/goals`)
    .orderBy("createdAt", "desc")
    .onSnapshot({
      next: (snapshot) => {
        goals = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        renderGoals(goals);
      },
      error: (error) => {
        console.error("Firestore error:", error);
        showError("Error loading goals. Please refresh.");
      },
    });
}

function renderGoals(goals) {
  personalGoalsList.innerHTML = "";
  academicGoalsList.innerHTML = "";
  careerGoalsList.innerHTML = "";

  goals.forEach((goal) => {
    const goalEl = createGoalElement(goal);
    const targetList = document.getElementById(`${goal.category}-goals`);
    if (targetList) targetList.appendChild(goalEl);
  });
}

function createGoalElement(goal) {
  const goalEl = document.createElement("div");
  goalEl.className = "goal-item";
  goalEl.dataset.id = goal.id;
  goalEl.style.borderLeft = `4px solid ${goal.color || "#4361ee"}`;

  const progressPercentage = Math.min(Math.max(goal.progress || 0, 0), 100);

  goalEl.innerHTML = `
    <div class="goal-content">
      <h4 class="goal-title">${goal.title}</h4>
      ${
        goal.description
          ? `<p class="goal-description">${goal.description}</p>`
          : ""
      }
      <div class="goal-progress-container">
        <div class="goal-progress-bar">
          <div class="goal-progress-fill" style="width: ${progressPercentage}%; background: ${
    goal.color || "#4361ee"
  }"></div>
        </div>
        <div class="goal-meta">
          <span>${progressPercentage}% completed</span>
          ${
            goal.targetDate
              ? `<span>📅 ${formatDate(goal.targetDate)}</span>`
              : ""
          }
        </div>
      </div>
      <div class="goal-actions">
        <button class="goal-edit-btn" data-id="${goal.id}">Edit</button>
        <button class="goal-delete-btn" data-id="${goal.id}">Delete</button>
      </div>
    </div>
  `;

  goalEl
    .querySelector(".goal-edit-btn")
    .addEventListener("click", handleEditGoal);
  goalEl
    .querySelector(".goal-delete-btn")
    .addEventListener("click", handleDeleteGoal);

  return goalEl;
}

// Goal Actions
async function handleEditGoal(e) {
  const goalId = e.target.dataset.id;
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) return;

  document.getElementById("goalTitle").value = goal.title;
  document.getElementById("goalCategory").value = goal.category;
  document.getElementById("goalDescription").value = goal.description || "";
  document.getElementById("goalTargetDate").value = goal.targetDate || "";
  document.getElementById("goalCurrentProgress").value = goal.progress || 0;
  document.getElementById("goalColor").value = goal.color || "#4361ee";
  document.getElementById("goalId").value = goal.id;
  document.querySelector(".modal-title").textContent = "Edit Goal";

  goalModal.style.display = "block";
}

async function handleDeleteGoal(e) {
  if (!confirm("Are you sure you want to delete this goal?")) return;
  const goalId = e.target.dataset.id;
  const user = auth.currentUser;
  if (!user) return;

  try {
    await db.doc(`users/${user.uid}/goals/${goalId}`).delete();
  } catch (error) {
    showError("Failed to delete goal");
    console.error("Delete goal error:", error);
  }
}

// Modal Functions
function setupEventListeners() {
  addGoalBtn.addEventListener("click", () => {
    goalForm.reset();
    document.getElementById("goalId").value = "";
    document.getElementById("goalCurrentProgress").value = 0;
    document.getElementById("goalColor").value = "#4361ee";
    document.querySelector(".modal-title").textContent = "Add New Goal";
    goalModal.style.display = "block";
  });

  document
    .querySelector(".close-btn")
    .addEventListener("click", closeGoalModal);
  goalModal.addEventListener("click", (e) => {
    if (e.target === goalModal) closeGoalModal();
  });

  goalForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const goalData = {
      title: document.getElementById("goalTitle").value,
      category: document.getElementById("goalCategory").value,
      description: document.getElementById("goalDescription").value || "",
      targetDate: document.getElementById("goalTargetDate").value || null,
      progress:
        parseInt(document.getElementById("goalCurrentProgress").value) || 0,
      color: document.getElementById("goalColor").value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
      const goalId = document.getElementById("goalId").value;
      if (goalId) {
        await db.doc(`users/${user.uid}/goals/${goalId}`).update(goalData);
      } else {
        goalData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection(`users/${user.uid}/goals`).add(goalData);
      }
      closeGoalModal();
    } catch (error) {
      showError("Failed to save goal");
      console.error("Save goal error:", error);
    }
  });
}

function closeGoalModal() {
  goalModal.style.display = "none";
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
