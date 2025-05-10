// Initialize Firebase
const auth = firebase.auth();
const db = firebase.firestore();

// DOM Elements
const moodOptions = document.querySelectorAll(".mood-option");
const moodNotes = document.getElementById("moodNotes");
const saveMoodBtn = document.getElementById("saveMoodBtn");
const moodEntriesContainer = document.getElementById("moodEntries");
const moodChartCanvas = document.getElementById("moodChart");
const viewButtons = document.querySelectorAll(".view-controls .view-btn");

// State
let selectedMood = null;
let selectedColor = null;
let moodChart = null;
let currentView = "daily";
let moods = [];

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
      startMoodApp(user.uid);
    } else {
      window.location.href = "index.html";
    }
  });

  document.querySelector(".logout-btn")?.addEventListener("click", () => {
    auth.signOut();
  });
}

function startMoodApp(userId) {
  db.collection(`users/${userId}/moods`)
    .orderBy("date", "desc")
    .limit(30)
    .onSnapshot((snapshot) => {
      moods = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate(),
      }));
      renderMoodHistory();
      renderMoodChart();
    });
}

function setupEventListeners() {
  // Mood selection
  moodOptions.forEach((option) => {
    option.addEventListener("click", () => {
      moodOptions.forEach((opt) => opt.classList.remove("selected"));
      option.classList.add("selected");
      selectedMood = parseInt(option.dataset.mood);
      selectedColor = option.dataset.color;
    });
  });

  // Save mood
  saveMoodBtn.addEventListener("click", async () => {
    if (!selectedMood) {
      showError("Please select a mood");
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Check if mood already logged today
      const existingEntry = moods.find((mood) => isSameDay(mood.date, today));

      const moodData = {
        value: selectedMood,
        color: selectedColor,
        notes: moodNotes.value || null,
        date: today,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      if (existingEntry) {
        // Update existing entry
        await db
          .doc(`users/${user.uid}/moods/${existingEntry.id}`)
          .update(moodData);
      } else {
        // Create new entry
        moodData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection(`users/${user.uid}/moods`).add(moodData);
      }

      // Reset form
      moodOptions.forEach((opt) => opt.classList.remove("selected"));
      moodNotes.value = "";
      selectedMood = null;
      selectedColor = null;
    } catch (error) {
      console.error("Error saving mood:", error);
      showError("Failed to save mood entry");
    }
  });

  // View controls
  viewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      viewButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentView = btn.dataset.view;
      renderMoodChart();
    });
  });
}

function renderMoodHistory() {
  moodEntriesContainer.innerHTML = "";

  // Show only the last 7 entries in the list view
  const entriesToShow =
    currentView === "daily" ? 7 : currentView === "weekly" ? 14 : moods.length;

  moods.slice(0, entriesToShow).forEach((mood) => {
    const moodEntry = document.createElement("div");
    moodEntry.className = "mood-entry";
    moodEntry.style.borderLeftColor = mood.color;

    const moodText = getMoodText(mood.value);
    const emoji = getMoodEmoji(mood.value);

    moodEntry.innerHTML = `
      <div class="mood-entry-date">${formatDate(mood.date)}</div>
      <div class="mood-entry-value" style="color: ${mood.color}">
        ${emoji} ${moodText}
      </div>
      ${mood.notes ? `<div class="mood-entry-notes">${mood.notes}</div>` : ""}
    `;

    moodEntriesContainer.appendChild(moodEntry);
  });
}

function renderMoodChart() {
  const ctx = moodChartCanvas.getContext("2d");

  // Destroy previous chart if exists
  if (moodChart) {
    moodChart.destroy();
  }

  // Prepare data based on current view
  let labels = [];
  let dataPoints = [];
  let backgroundColors = [];

  if (currentView === "daily") {
    // Last 7 days
    const daysToShow = 7;
    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const moodEntry = moods.find((mood) => isSameDay(mood.date, date));

      labels.push(formatDateForDisplay(date));
      dataPoints.push(moodEntry?.value || null);
      backgroundColors.push(moodEntry?.color || "#e2e8f0");
    }
  } else if (currentView === "weekly") {
    // Last 4 weeks (weekly averages)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      // Find all mood entries for this week
      const weekMoods = moods.filter((mood) => {
        return mood.date >= weekStart && mood.date <= weekEnd;
      });

      // Calculate average mood for the week
      let average = null;
      if (weekMoods.length > 0) {
        const sum = weekMoods.reduce((total, mood) => total + mood.value, 0);
        average = sum / weekMoods.length;
      }

      // Format label (e.g., "Oct 2-8")
      const startDay = weekStart.getDate();
      const endDay = weekEnd.getDate();
      const month = weekStart.toLocaleString("default", { month: "short" });
      labels.push(`${month} ${startDay}-${endDay}`);

      dataPoints.push(average);
      backgroundColors.push(average ? getColorForValue(average) : "#e2e8f0");
    }
  } else {
    // Last 6 months (monthly averages)
    for (let i = 5; i >= 0; i--) {
      const month = new Date();
      month.setMonth(month.getMonth() - i);
      const monthMoods = moods.filter(
        (mood) =>
          mood.date.getMonth() === month.getMonth() &&
          mood.date.getFullYear() === month.getFullYear()
      );

      const average =
        monthMoods.length > 0
          ? monthMoods.reduce((sum, mood) => sum + mood.value, 0) /
            monthMoods.length
          : null;

      labels.push(month.toLocaleString("default", { month: "short" }));
      dataPoints.push(average);
      backgroundColors.push(average ? getColorForValue(average) : "#e2e8f0");
    }
  }

  // Create the chart with consistent settings
  moodChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Mood Level",
          data: dataPoints,
          backgroundColor: backgroundColors,
          borderColor: backgroundColors,
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: false,
          min: 0.5,
          max: 5.5,
          ticks: {
            stepSize: 1,
            callback: function (value) {
              return getMoodText(value);
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
              const value = context.raw;
              return value
                ? `${getMoodText(value)} (${value.toFixed(1)})`
                : "No data";
            },
          },
        },
        legend: {
          display: false,
        },
      },
    },
  });
}

// Helper functions
function getMoodText(value) {
  if (!value) return "No data";
  const moods = {
    1: "Poor",
    2: "Okay",
    3: "Neutral",
    4: "Good",
    5: "Great",
  };
  return moods[Math.round(value)] || "No data";
}

function getMoodEmoji(value) {
  if (!value) return "❓";
  const emojis = {
    1: "😞",
    2: "😕",
    3: "😐",
    4: "🙂",
    5: "😊",
  };
  return emojis[Math.round(value)] || "❓";
}

function getColorForValue(value) {
  if (!value) return "#e2e8f0";
  const roundedValue = Math.round(value);
  const colors = {
    1: "#f87171",
    2: "#fb923c",
    3: "#facc15",
    4: "#a3e635",
    5: "#4ade80",
  };
  return colors[roundedValue] || "#e2e8f0";
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateForDisplay(date) {
  const options = { month: "short", day: "numeric" };
  return date.toLocaleDateString("en-US", options);
}

function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
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
