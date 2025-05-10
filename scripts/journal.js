// Initialize Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Initialize Quill editor
let quill;

// App state
const state = {
  currentUser: null,
  currentEntryId: null,
  sortOrder: "newest",
  unsubscribeEntries: null,
};

// DOM elements
const elements = {
  editorContainer: document.getElementById("editor-container"),
  journalDate: document.getElementById("journalDate"),
  saveEntryBtn: document.getElementById("saveEntryBtn"),
  deleteEntryBtn: document.getElementById("deleteEntryBtn"),
  newEntryBtn: document.getElementById("newEntryBtn"),
  entriesList: document.getElementById("entriesList"),
  sortSelect: document.getElementById("sortSelect"),
  currentDate: document.getElementById("currentDate"),
  themeToggle: document.getElementById("themeToggle"),
  logoutBtn: document.querySelector(".logout-btn"),
  editorTitle: document.getElementById("editorTitle"),
};

// Initialize the application
function init() {
  initializeEditor();
  setupAuth();
  setupEventListeners();
  initializeDates();
  loadTheme();
}

// Initialize Quill editor
function initializeEditor() {
  quill = new Quill("#editor-container", {
    theme: "snow",
    modules: {
      toolbar: [
        ["bold", "italic", "underline", "strike"],
        ["blockquote", "code-block"],
        [{ header: 1 }, { header: 2 }],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "image", "video"],
        ["clean"],
      ],
    },
    placeholder: "Write your journal entry here...",
  });
}

// Authentication setup
function setupAuth() {
  auth.onAuthStateChanged((user) => {
    state.currentUser = user;
    if (user) {
      startJournalApp(user.uid);
    } else {
      window.location.href = "index.html";
    }
  });

  elements.logoutBtn.addEventListener("click", () => auth.signOut());
}

// Start journal functionality for authenticated user
function startJournalApp(userId) {
  // Load today's entry by default
  loadEntryForDate(userId, elements.journalDate.value);

  // Set up real-time entries listener with current sort order
  setupEntriesListener(userId);
}

// Set up Firestore listener with current sort order
function setupEntriesListener(userId) {
  // Clean up previous listener if exists
  if (state.unsubscribeEntries) state.unsubscribeEntries();

  // Create query with current sort order
  const query = db
    .collection(`users/${userId}/journalEntries`)
    .orderBy("date", state.sortOrder === "newest" ? "desc" : "asc");

  // Set up new listener
  state.unsubscribeEntries = query.onSnapshot(
    (snapshot) => {
      renderEntriesList(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
      );
    },
    (error) => {
      console.error("Entries listener error:", error);
      showError("Error loading entries", "error");
    }
  );
}

// Entry Management Functions
async function loadEntryForDate(userId, date) {
  try {
    showLoading(true);
    const snapshot = await db
      .collection(`users/${userId}/journalEntries`)
      .where("date", "==", date)
      .limit(1)
      .get();

    if (snapshot.empty) {
      resetEditorForNewEntry();
    } else {
      const doc = snapshot.docs[0];
      state.currentEntryId = doc.id;
      const entry = doc.data();

      // Load content into Quill editor
      quill.setContents(
        entry.content ? JSON.parse(entry.content) : [{ insert: "\n" }]
      );

      elements.deleteEntryBtn.style.display = "inline-block";
    }
  } catch (error) {
    console.error("Error loading entry:", error);
    showError("Failed to load journal entry");
  } finally {
    showLoading(false);
  }
}

function resetEditorForNewEntry() {
  state.currentEntryId = null;
  quill.setContents([{ insert: "\n" }]);
  elements.deleteEntryBtn.style.display = "none";
  elements.journalDate.value = new Date().toISOString().split("T")[0];
}

async function saveEntry() {
  const date = elements.journalDate.value;
  if (!date) {
    showError("Please select a date");
    return;
  }

  try {
    showLoading(true, "Saving entry...");

    // Prepare entry data
    const entryData = {
      date,
      title: extractTitle(quill.getText()),
      content: JSON.stringify(quill.getContents()),
      wordCount: countWords(quill.getText()),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    // Save to Firestore
    if (state.currentEntryId) {
      await db
        .doc(
          `users/${state.currentUser.uid}/journalEntries/${state.currentEntryId}`
        )
        .update(entryData);
    } else {
      entryData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const docRef = await db
        .collection(`users/${state.currentUser.uid}/journalEntries`)
        .add(entryData);
      state.currentEntryId = docRef.id;
      elements.deleteEntryBtn.style.display = "inline-block";
    }

    showError("Entry saved successfully!", "success");
  } catch (error) {
    console.error("Error saving entry:", error);
    showError("Failed to save journal entry");
  } finally {
    showLoading(false);
  }
}

async function deleteEntry() {
  if (
    !state.currentEntryId ||
    !confirm("Are you sure you want to delete this entry?")
  )
    return;

  try {
    showLoading(true, "Deleting entry...");
    await db
      .doc(
        `users/${state.currentUser.uid}/journalEntries/${state.currentEntryId}`
      )
      .delete();
    showError("Entry deleted successfully!", "success");
    resetEditorForNewEntry();
  } catch (error) {
    console.error("Error deleting entry:", error);
    showError("Failed to delete entry");
  } finally {
    showLoading(false);
  }
}

// Entries Display Functions
function renderEntriesList(entries) {
  elements.entriesList.innerHTML =
    entries.length > 0
      ? ""
      : '<div class="no-entries">No journal entries found</div>';

  entries.forEach((entry) => {
    const entryEl = document.createElement("div");
    entryEl.className = "entry-card";
    entryEl.dataset.id = entry.id;

    // Create preview content
    const previewText = getEntryPreview(entry.content);
    const mediaPreviews = getMediaPreviews(entry.media);

    entryEl.innerHTML = `
      <div class="entry-date">${formatDateDisplay(entry.date)}</div>
      <h4 class="entry-title">${entry.title || "Untitled Entry"}</h4>
      <div class="entry-content">${previewText}</div>
      <div class="entry-wordcount">${entry.wordCount || 0} words</div>
      ${mediaPreviews}
      <div class="entry-actions">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </div>
    `;

    // Add click handlers
    entryEl
      .querySelector(".edit-btn")
      .addEventListener("click", () => loadSelectedEntry(entry));
    entryEl.querySelector(".delete-btn").addEventListener("click", () => {
      if (confirm("Are you sure you want to delete this entry?")) {
        deleteSelectedEntry(entry.id);
      }
    });

    elements.entriesList.appendChild(entryEl);
  });
}

function getEntryPreview(content) {
  if (!content) return "View entry...";

  try {
    const delta = JSON.parse(content);
    return (
      delta.ops
        .filter((op) => typeof op.insert === "string")
        .map((op) => op.insert.replace(/[\n\r]/g, " "))
        .join("")
        .substring(0, 100) + (delta.ops.length > 100 ? "..." : "")
    );
  } catch {
    return "View entry...";
  }
}

function getMediaPreviews(media = []) {
  if (!media || media.length === 0) return "";

  return `
    <div class="entry-media">
      ${media
        .slice(0, 3)
        .map(
          (item) => `
        ${
          item.type === "image"
            ? `<img src="${item.url}" alt="${item.name}" class="media-thumbnail" loading="lazy">`
            : `<video src="${item.url}" class="media-thumbnail" controls></video>`
        }
      `
        )
        .join("")}
      ${
        media.length > 3
          ? `<div class="media-more">+${media.length - 3}</div>`
          : ""
      }
    </div>
  `;
}

function loadSelectedEntry(entry) {
  state.currentEntryId = entry.id;
  elements.journalDate.value = entry.date;
  elements.editorTitle.textContent = entry.title || "Existing Entry";

  quill.setContents(
    entry.content ? JSON.parse(entry.content) : [{ insert: "\n" }]
  );
  elements.deleteEntryBtn.style.display = "inline-block";

  // Scroll to editor
  document.querySelector(".editor-card").scrollIntoView({ behavior: "smooth" });
}

async function deleteSelectedEntry(entryId) {
  try {
    showLoading(true, "Deleting entry...");

    if (state.currentEntryId === entryId) {
      resetEditorForNewEntry();
    }

    await db
      .doc(`users/${state.currentUser.uid}/journalEntries/${entryId}`)
      .delete();
    showError("Entry deleted successfully!", "success");
  } catch (error) {
    console.error("Error deleting entry:", error);
    showError("Failed to delete entry");
  } finally {
    showLoading(false);
  }
}

// Utility Functions
function initializeDates() {
  const today = new Date().toISOString().split("T")[0];
  elements.journalDate.value = today;
  elements.currentDate.textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateDisplay(dateString) {
  return new Date(dateString).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function extractTitle(text) {
  return text.trim().split("\n")[0] || "Untitled Entry";
}

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function showError(message, type = "error") {
  const errorEl = document.createElement("div");
  errorEl.className = `notification ${type}`;
  errorEl.textContent = message;
  document.body.appendChild(errorEl);
  setTimeout(() => errorEl.remove(), 3000);
}

function showLoading(show, message = "") {
  let loader = document.getElementById("loader");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "loader";
    loader.className = "loader";
    loader.innerHTML = `
      <div class="loader-spinner"></div>
      ${message ? `<div class="loader-message">${message}</div>` : ""}
    `;
    document.body.appendChild(loader);
  }
  loader.style.display = show ? "flex" : "none";
}

// Theme Management
function loadTheme() {
  const savedTheme = localStorage.getItem("themePreference") || "light";
  document.body.classList.add(`${savedTheme}-theme`);
  updateThemeToggleIcon(savedTheme);
}

function toggleTheme() {
  const isDark = document.body.classList.contains("dark-theme");
  document.body.classList.replace(
    isDark ? "dark-theme" : "light-theme",
    isDark ? "light-theme" : "dark-theme"
  );
  const newTheme = isDark ? "light" : "dark";
  localStorage.setItem("themePreference", newTheme);
  updateThemeToggleIcon(newTheme);
}

function updateThemeToggleIcon(theme) {
  const moon = elements.themeToggle.querySelector(".moon");
  const sun = elements.themeToggle.querySelector(".sun");
  moon.style.display = theme === "dark" ? "none" : "inline";
  sun.style.display = theme === "dark" ? "inline" : "none";
}

// Event Listeners
function setupEventListeners() {
  // Editor events
  elements.saveEntryBtn.addEventListener("click", saveEntry);
  elements.deleteEntryBtn.addEventListener("click", deleteEntry);
  elements.newEntryBtn.addEventListener("click", resetEditorForNewEntry);

  // Date change
  elements.journalDate.addEventListener("change", () => {
    if (state.currentUser) {
      loadEntryForDate(state.currentUser.uid, elements.journalDate.value);
    }
  });

  // Sort order change
  elements.sortSelect.addEventListener("change", (e) => {
    state.sortOrder = e.target.value;
    if (state.currentUser) {
      setupEntriesListener(state.currentUser.uid);
    }
  });

  // Theme toggle
  elements.themeToggle.addEventListener("click", toggleTheme);
}

document.addEventListener("DOMContentLoaded", init);

