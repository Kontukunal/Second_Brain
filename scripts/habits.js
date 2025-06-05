// Initialize Firebase
const auth = firebase.auth();
const db = firebase.firestore();

// DOM Elements
const addHabitBtn = document.getElementById("addHabitBtn");
const habitModal = document.getElementById("habitModal");
const habitForm = document.getElementById("habitForm");
const habitContainer = document.getElementById("habitContainer");
const viewControls = document.querySelectorAll(
  ".habit-view-controls .view-btn"
);
const chartContainer = document.querySelector(".chart-container");
const chartCanvas = document.getElementById("progressChart");

// State
let habits = [];
let currentView = "daily";
let habitsUnsubscribe = null;
let progressChart = null;

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
      startHabitsApp(user.uid);
    } else {
      window.location.href = "index.html";
    }
  });

  document.querySelector(".logout-btn")?.addEventListener("click", () => {
    auth.signOut();
  });
}

function startHabitsApp(userId) {
  if (habitsUnsubscribe) habitsUnsubscribe();

  habitsUnsubscribe = db
    .collection(`users/${userId}/habits`)
    .orderBy("createdAt", "desc")
    .onSnapshot({
      next: (snapshot) => {
        habits = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        renderView();
      },
      error: (error) => {
        console.error("Firestore error:", error);
        showError("Error loading habits. Please refresh.");
      },
    });
}

function renderView() {
  if (currentView === "graph") {
    renderProgressChart();
    habitContainer.style.display = "none";
    chartContainer.style.display = "block";
  } else {
    renderHabits(habits);
    habitContainer.style.display = "grid";
    chartContainer.style.display = "none";
  }
}

function renderHabits(habits) {
  habitContainer.innerHTML = "";

  habits.forEach((habit) => {
    const habitEl = createHabitElement(habit);
    habitContainer.appendChild(habitEl);
  });
}

function createHabitElement(habit) {
  const habitEl = document.createElement("div");
  habitEl.className = `habit-card ${currentView}-view`;
  habitEl.style.borderLeftColor = habit.color || "#4ade80";

  const streak = calculateStreak(habit.completions || []);
  const completionRate = calculateCompletionRate(habit.completions || []);

  habitEl.innerHTML = `
    <div class="habit-header">
      <div class="habit-title">
        <span class="icon">${getCategoryIcon(habit.category)}</span>
        ${habit.name}
      </div>
      <div class="habit-actions">
        <button class="edit-btn" data-id="${habit.id}">✏️</button>
        <button class="delete-btn" data-id="${habit.id}">🗑️</button>
      </div>
    </div>
    <div class="habit-streak">
      🔥 ${streak} day streak | ✅ ${completionRate}% completion
    </div>
    <div class="habit-tracker">
      <div class="tracker-header">
        <span>${getViewTitle()}</span>
        <span>${completionRate}%</span>
      </div>
      <div class="tracker-grid">
        ${generateTrackerGrid(habit)}
      </div>
    </div>
  `;

  habitEl
    .querySelector(".edit-btn")
    .addEventListener("click", () => handleEditHabit(habit));
  habitEl
    .querySelector(".delete-btn")
    .addEventListener("click", () => handleDeleteHabit(habit.id));
  habitEl.querySelectorAll(".tracker-day").forEach((day) => {
    day.addEventListener("click", () =>
      toggleHabitCompletion(habit, day.dataset.date)
    );
  });

  return habitEl;
}

function generateTrackerGrid(habit) {
  const today = new Date();
  const gridDays = [];
  const completions = habit.completions || [];

  if (currentView === "daily") {
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = formatDateForStorage(date);
      const isCompleted = completions.includes(dateStr);
      const isToday = isSameDay(date, today);

      gridDays.push(`
        <div class="tracker-day ${isCompleted ? "completed" : ""} ${
        isToday ? "today" : ""
      }" 
             data-date="${dateStr}"
             title="${formatDate(dateStr)}">
          <span class="tracker-day-label">${date.getDate()}</span>
        </div>
      `);
    }
  } else if (currentView === "weekly") {
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekCompletions = completions.filter((dateStr) => {
        const date = new Date(dateStr);
        return date >= weekStart && date <= weekEnd;
      }).length;

      const completionPercent = Math.round((weekCompletions / 7) * 100);

      gridDays.push(`
        <div class="tracker-day ${
          completionPercent === 100 ? "completed" : ""
        }" 
             title="Week ${i + 1}: ${completionPercent}%">
          ${completionPercent}%
        </div>
      `);
    }
  } else {
    for (let i = 3; i >= 0; i--) {
      const month = new Date(today);
      month.setMonth(month.getMonth() - i);
      const daysInMonth = new Date(
        month.getFullYear(),
        month.getMonth() + 1,
        0
      ).getDate();

      const monthCompletions = completions.filter((dateStr) => {
        const date = new Date(dateStr);
        return (
          date.getMonth() === month.getMonth() &&
          date.getFullYear() === month.getFullYear()
        );
      }).length;

      const completionPercent = Math.round(
        (monthCompletions / daysInMonth) * 100
      );

      gridDays.push(`
        <div class="tracker-day ${
          completionPercent === 100 ? "completed" : ""
        }" 
             title="${month.toLocaleString("default", {
               month: "short",
             })}: ${completionPercent}%">
          ${month.toLocaleString("default", { month: "short" })}
        </div>
      `);
    }
  }

  return gridDays.join("");
}

function renderProgressChart() {
  const ctx = chartCanvas.getContext("2d");

  if (progressChart) {
    progressChart.destroy();
  }

  const dates = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(formatDateForStorage(date));
  }

  const datasets = habits.map((habit) => {
    const completions = habit.completions || [];
    const data = dates.map((date) => (completions.includes(date) ? 1 : 0));

    const smoothData = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - 3);
      const end = Math.min(data.length - 1, i + 3);
      const slice = data.slice(start, end + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      smoothData.push(sum / slice.length);
    }

    return {
      label: habit.name,
      data: smoothData,
      borderColor: habit.color || getRandomColor(),
      backgroundColor: "transparent",
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
    };
  });

  progressChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates.map((date) => formatDateForDisplay(date)),
      datasets: datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 1,
          ticks: {
            callback: function (value) {
              return value * 100 + "%";
            },
          },
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function (context) {
              return (
                context.dataset.label +
                ": " +
                (context.raw * 100).toFixed(0) +
                "%"
              );
            },
          },
        },
        legend: {
          position: "top",
          labels: {
            boxWidth: 12,
            padding: 20,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
      },
    },
  });
}

// Helper functions
function calculateStreak(completions) {
  const today = formatDateForStorage(new Date());
  const yesterday = formatDateForStorage(new Date(Date.now() - 86400000));

  if (!completions.includes(today)) {
    if (completions.includes(yesterday)) {
      return 1;
    }
    return 0;
  }

  let streak = 1;
  let currentDate = new Date(Date.now() - 86400000);

  while (completions.includes(formatDateForStorage(currentDate))) {
    streak++;
    currentDate = new Date(currentDate.getTime() - 86400000);
  }

  return streak;
}

function calculateCompletionRate(completions) {
  const today = new Date();
  const dateRange =
    currentView === "daily" ? 7 : currentView === "weekly" ? 28 : 120;
  const startDate = new Date(today.getTime() - dateRange * 86400000);

  const relevantCompletions = completions.filter((dateStr) => {
    const date = new Date(dateStr);
    return date >= startDate;
  });

  const totalDays =
    currentView === "daily" ? 7 : currentView === "weekly" ? 28 : 120;

  return Math.round((relevantCompletions.length / totalDays) * 100);
}

function getCategoryIcon(category) {
  const icons = {
    health: "💪",
    productivity: "📊",
    learning: "📚",
    mindfulness: "🧘",
  };
  return icons[category] || "🔄";
}

function getViewTitle() {
  return {
    daily: "Last 7 Days",
    weekly: "Last 4 Weeks",
    monthly: "Last 4 Months",
  }[currentView];
}

function formatDateForStorage(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const options = { weekday: "short", month: "short", day: "numeric" };
  return new Date(dateStr).toLocaleDateString("en-US", options);
}

function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function getRandomColor() {
  const colors = [
    "#4ade80",
    "#60a5fa",
    "#f87171",
    "#fbbf24",
    "#a78bfa",
    "#34d399",
    "#22d3ee",
    "#818cf8",
    "#f472b6",
    "#fb923c",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Event handlers
function setupEventListeners() {
  addHabitBtn.addEventListener("click", () => {
    habitForm.reset();
    document.getElementById("habitId").value = "";
    document.querySelector(".modal-title").textContent = "Add New Habit";
    habitModal.style.display = "block";
  });

  document
    .querySelector(".close-btn")
    .addEventListener("click", closeHabitModal);
  habitModal.addEventListener("click", (e) => {
    if (e.target === habitModal) closeHabitModal();
  });

  habitForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const habitData = {
      name: document.getElementById("habitName").value,
      category: document.getElementById("habitCategory").value,
      color: document.getElementById("habitColor").value,
      reminder: document.getElementById("habitReminder").value || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      completions: [],
    };

    try {
      const habitId = document.getElementById("habitId").value;
      if (habitId) {
        await db.doc(`users/${user.uid}/habits/${habitId}`).update(habitData);
      } else {
        habitData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection(`users/${user.uid}/habits`).add(habitData);
      }
      closeHabitModal();
    } catch (error) {
      showError("Failed to save habit");
      console.error("Save habit error:", error);
    }
  });

  viewControls.forEach((btn) => {
    btn.addEventListener("click", () => {
      viewControls.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentView = btn.dataset.view;
      renderView();
    });
  });
}

async function toggleHabitCompletion(habit, dateStr) {
  const user = auth.currentUser;
  if (!user) return;

  const completions = habit.completions || [];
  const newCompletions = completions.includes(dateStr)
    ? completions.filter((d) => d !== dateStr)
    : [...completions, dateStr];

  try {
    await db.doc(`users/${user.uid}/habits/${habit.id}`).update({
      completions: newCompletions,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    showError("Failed to update habit");
    console.error("Update habit error:", error);
  }
}

async function handleEditHabit(habit) {
  document.getElementById("habitName").value = habit.name;
  document.getElementById("habitCategory").value = habit.category;
  document.getElementById("habitColor").value = habit.color || "#4ade80";
  document.getElementById("habitReminder").value = habit.reminder || "";
  document.getElementById("habitId").value = habit.id;
  document.querySelector(".modal-title").textContent = "Edit Habit";
  habitModal.style.display = "block";
}

async function handleDeleteHabit(id) {
  if (!confirm("Are you sure you want to delete this habit?")) return;
  const user = auth.currentUser;
  if (!user) return;

  try {
    await db.doc(`users/${user.uid}/habits/${id}`).delete();
  } catch (error) {
    showError("Failed to delete habit");
    console.error("Delete habit error:", error);
  }
}

function closeHabitModal() {
  habitModal.style.display = "none";
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
