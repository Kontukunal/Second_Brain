// Initialize Firebase
auth = firebase.auth();
db = firebase.firestore();
// const { Timestamp } = firebase.firestore;

// DOM Elements
const addEventBtn = document.getElementById("addEventBtn");
const eventModal = document.getElementById("eventModal");
const closeBtn = document.querySelector(".close-btn");
const eventForm = document.getElementById("eventForm");
const themeToggle = document.getElementById("themeToggle");
const viewTitle = document.getElementById("viewTitle");
const viewButtons = document.querySelectorAll(".view-btn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const currentPeriod = document.getElementById("currentPeriod");
const eventsList = document.getElementById("eventsList");
const dayDate = document.getElementById("dayDate");

// Form elements
const eventTitle = document.getElementById("eventTitle");
const eventDate = document.getElementById("eventDate");
const eventTime = document.getElementById("eventTime");
const eventDescription = document.getElementById("eventDescription");
const eventColor = document.getElementById("eventColor");
const submitBtn = document.querySelector(".submit-btn");

// Calendar views
const dayView = document.getElementById("dayView");
const weekView = document.getElementById("weekView");
const monthView = document.getElementById("monthView");
const dayTimeline = document.getElementById("dayTimeline");
const weekDaysHeader = document.getElementById("weekDaysHeader");
const weekGrid = document.getElementById("weekGrid");
const monthDays = document.getElementById("monthDays");

// Calendar state
let currentDate = new Date();
let currentView = "month";
let events = [];
let currentEventId = null;
let draggedEvent = null;
let unsubscribeFromEvents = null;

// Initialize the app
function init() {
  setupAuth();
  addLogoutButton();

  // Set initial view
  switchView(currentView);

  // Set up event listeners
  setupEventListeners();

  // Render initial data
  updateCurrentDate();
  loadThemePreference();
}

// ======================
// AUTHENTICATION FUNCTIONS
// ======================

function setupAuth() {
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const toggleSignup = document.getElementById("toggle-signup");
  const authError = document.getElementById("auth-error");

  // Toggle between login and signup forms
  toggleSignup.addEventListener("click", (e) => {
    e.preventDefault();
    loginForm.style.display =
      loginForm.style.display === "none" ? "block" : "none";
    signupForm.style.display =
      signupForm.style.display === "none" ? "block" : "none";
    toggleSignup.textContent =
      loginForm.style.display === "none"
        ? "Already have an account? Login"
        : "Don't have an account? Sign up";
    authError.textContent = "";
  });

  // Login handler
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
    } catch (error) {
      authError.textContent = error.message;
      console.error("Login error:", error);
    }
  });

  // Signup handler
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;

    try {
      await firebase.auth().createUserWithEmailAndPassword(email, password);
    } catch (error) {
      authError.textContent = error.message;
      console.error("Signup error:", error);
    }
  });

  // Auth state observer
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      console.log("User signed in:", user.email);
      document.getElementById("auth-container").style.display = "none";
      document.querySelector(".app").style.display = "grid";
      setupRealtimeUpdates();
    } else {
      console.log("User signed out");
      document.getElementById("auth-container").style.display = "flex";
      document.querySelector(".app").style.display = "none";
    }
  });
}

function addLogoutButton() {
  const logoutBtn = document.querySelector(".logout-btn");
  logoutBtn.addEventListener("click", () => firebase.auth().signOut());
}

// ======================
// FIRESTORE FUNCTIONS
// ======================

async function saveEvents() {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    // First delete all existing events
    const snapshot = await db.collection(`users/${user.uid}/events`).get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Then add all current events
    const eventsRef = db.collection(`users/${user.uid}/events`);
    const batch2 = db.batch();
    events.forEach((event) => {
      const docRef = eventsRef.doc(event.id);
      batch2.set(docRef, event);
    });
    await batch2.commit();
  } catch (error) {
    console.error("Error saving events:", error);
    throw error;
  }
}

async function deleteEventFromFirestore(id) {
  try {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error("User not authenticated");

    await db.collection(`users/${user.uid}/events`).doc(id).delete();
  } catch (error) {
    console.error("Error deleting event:", error);
    throw error;
  }
}

function setupRealtimeUpdates() {
  const user = auth.currentUser;
  if (!user) return;

  unsubscribeFromEvents = db.collection(`users/${user.uid}/events`).onSnapshot(
    (snapshot) => {
      events = snapshot.docs.map((doc) => doc.data());
      renderCurrentView();
      renderUpcomingEvents();
    },
    (error) => {
      console.error("Error listening to events:", error);
    }
  );
}

// ======================
// EVENT HANDLING FUNCTIONS
// ======================

function setupEventListeners() {
  // Modal controls
  addEventBtn.addEventListener("click", () => openEventModal());
  closeBtn.addEventListener("click", () => closeEventModal());
  window.addEventListener("click", (e) => {
    if (e.target === eventModal) closeEventModal();
  });

  // Event form submission
  eventForm.addEventListener("submit", handleEventSubmit);

  // View buttons
  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      switchView(view);
    });
  });

  // Navigation buttons
  prevBtn.addEventListener("click", navigatePrevious);
  nextBtn.addEventListener("click", navigateNext);

  // Theme toggle
  themeToggle.addEventListener("click", toggleTheme);
}

function openEventModal(event = null) {
  if (event) {
    // Edit mode
    currentEventId = event.id;
    eventTitle.value = event.title;
    eventDate.value = event.date;
    eventTime.value = event.time;
    eventDescription.value = event.description || "";
    eventColor.value = event.color;
    submitBtn.textContent = "Update Event";
  } else {
    // Add mode
    currentEventId = null;
    eventForm.reset();
    eventDate.value = formatDateForStorage(currentDate);
    submitBtn.textContent = "Add Event";
  }
  eventModal.style.display = "block";
}

function closeEventModal() {
  eventModal.style.display = "none";
}

async function handleEventSubmit(e) {
  e.preventDefault();

  const event = {
    id: currentEventId || Date.now().toString(), // Keep same ID generation
    title: eventTitle.value,
    date: eventDate.value,
    time: eventTime.value,
    description: eventDescription.value,
    color: eventColor.value,
  };

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    if (currentEventId) {
      // Update existing event
      await db
        .collection(`users/${user.uid}/events`)
        .doc(event.id)
        .update(event);
    } else {
      // Add new event
      await db.collection(`users/${user.uid}/events`).doc(event.id).set(event);
    }

    // No need to manually update events array - realtime listener will handle it
    closeEventModal();
  } catch (error) {
    console.error("Error saving event:", error);
    alert("Failed to save event. Please try again.");
  }
}
async function deleteEvent(id) {
  if (confirm("Are you sure you want to delete this event?")) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");

      await db.collection(`users/${user.uid}/events`).doc(id).delete();
      // No need to manually update events array - realtime listener will handle it
    } catch (error) {
      console.error("Error deleting event:", error);
      alert("Failed to delete event. Please try again.");
    }
  }
}

// ======================
// CALENDAR VIEW FUNCTIONS
// ======================

function switchView(view) {
  viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  dayView.classList.remove("active");
  weekView.classList.remove("active");
  monthView.classList.remove("active");

  currentView = view;
  switch (view) {
    case "day":
      dayView.classList.add("active");
      viewTitle.textContent = "Day View";
      break;
    case "week":
      weekView.classList.add("active");
      viewTitle.textContent = "Week View";
      break;
    case "month":
      monthView.classList.add("active");
      viewTitle.textContent = "Month View";
      break;
  }

  renderCurrentView();
}

function renderCurrentView() {
  switch (currentView) {
    case "day":
      renderDayView();
      break;
    case "week":
      renderWeekView();
      break;
    case "month":
      renderMonthView();
      break;
  }
}

function renderDayView() {
  dayDate.textContent = currentDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  currentPeriod.textContent = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  dayTimeline.innerHTML = "";

  // Create time slots (12AM to 11PM)
  for (let hour = 0; hour < 24; hour++) {
    const timeSlot = document.createElement("div");
    timeSlot.className = "time-slot";
    timeSlot.dataset.hour = hour;

    const timeLabel = document.createElement("div");
    timeLabel.className = "time-label";
    timeLabel.textContent = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${
      hour < 12 ? "AM" : "PM"
    }`;
    timeSlot.appendChild(timeLabel);

    const timeContent = document.createElement("div");
    timeContent.className = "time-content";
    timeContent.dataset.date = formatDateForStorage(currentDate);
    timeContent.dataset.hour = hour;
    timeContent.addEventListener("dragover", handleDragOver);
    timeContent.addEventListener("drop", handleDrop);

    // Add events for this hour
    const dateStr = formatDateForStorage(currentDate);
    const hourEvents = events.filter((event) => {
      if (event.date !== dateStr) return false;
      const eventHour = parseInt(event.time.split(":")[0]);
      return eventHour === hour;
    });

    hourEvents.forEach((event) => {
      const eventElement = createEventElement(event, "day");
      timeContent.appendChild(eventElement);
    });

    timeSlot.appendChild(timeContent);
    dayTimeline.appendChild(timeSlot);
  }
}

function renderWeekView() {
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  currentPeriod.textContent = `${startOfWeek.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} - ${endOfWeek.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  weekDaysHeader.innerHTML = "";
  weekGrid.innerHTML = "";

  // Create week days header
  const timeLabelHeader = document.createElement("div");
  timeLabelHeader.className = "week-day-header";
  weekDaysHeader.appendChild(timeLabelHeader);

  for (let i = 0; i < 7; i++) {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + i);

    const dayHeader = document.createElement("div");
    dayHeader.className = "week-day-header";
    if (isSameDay(day, new Date())) {
      dayHeader.classList.add("today");
    }
    dayHeader.textContent = day.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    weekDaysHeader.appendChild(dayHeader);
  }

  // Create time grid
  for (let hour = 0; hour < 24; hour++) {
    const timeLabel = document.createElement("div");
    timeLabel.className = "week-hour";
    timeLabel.textContent = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${
      hour < 12 ? "AM" : "PM"
    }`;
    weekGrid.appendChild(timeLabel);

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);

      const dayCell = document.createElement("div");
      dayCell.className = "week-day";
      dayCell.dataset.date = formatDateForStorage(day);
      dayCell.dataset.hour = hour;
      if (isSameDay(day, new Date())) {
        dayCell.classList.add("today");
      }
      dayCell.addEventListener("dragover", handleDragOver);
      dayCell.addEventListener("drop", handleDrop);

      // Add events for this day and hour
      const dateStr = formatDateForStorage(day);
      const hourEvents = events.filter((event) => {
        if (event.date !== dateStr) return false;
        const eventHour = parseInt(event.time.split(":")[0]);
        return eventHour === hour;
      });

      hourEvents.forEach((event) => {
        const eventElement = createEventElement(event, "week");
        dayCell.appendChild(eventElement);
      });

      weekGrid.appendChild(dayCell);
    }
  }
}

function renderMonthView() {
  currentPeriod.textContent = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const firstDay = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  );
  const lastDay = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  );
  const totalDays = lastDay.getDate();
  const startingDay = firstDay.getDay();

  monthDays.innerHTML = "";

  // Add empty cells for days before the 1st
  for (let i = 0; i < startingDay; i++) {
    const emptyDay = document.createElement("div");
    emptyDay.className = "calendar-day empty";
    monthDays.appendChild(emptyDay);
  }

  // Add days of the month
  for (let i = 1; i <= totalDays; i++) {
    const dayDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      i
    );
    const dayElement = document.createElement("div");
    dayElement.className = "calendar-day";
    dayElement.dataset.date = formatDateForStorage(dayDate);
    dayElement.addEventListener("dragover", handleDragOver);
    dayElement.addEventListener("drop", handleDrop);

    if (isSameDay(dayDate, new Date())) {
      dayElement.classList.add("today");
    }

    const dayNumber = document.createElement("div");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = i;
    dayElement.appendChild(dayNumber);

    // Add events for this day
    const dateStr = formatDateForStorage(dayDate);
    const dayEvents = events.filter((event) => {
      const eventDate = new Date(event.date);
      return (
        eventDate.getFullYear() === dayDate.getFullYear() &&
        eventDate.getMonth() === dayDate.getMonth() &&
        eventDate.getDate() === dayDate.getDate()
      );
    });

    dayEvents.forEach((event) => {
      const eventElement = createEventElement(event, "month");
      dayElement.appendChild(eventElement);
    });

    monthDays.appendChild(dayElement);
  }
}

// ======================
// EVENT ELEMENT FUNCTIONS
// ======================

function createEventElement(event, viewType) {
  const eventElement = document.createElement("div");
  eventElement.className = `${viewType}-event`;
  eventElement.draggable = true;
  eventElement.dataset.eventId = event.id;

  // Different content based on view type
  if (viewType === "day") {
    eventElement.textContent = `${event.title} (${formatTime(event.time)})`;
  } else if (viewType === "week") {
    eventElement.textContent = event.title;
  } else {
    // month
    eventElement.textContent = `${formatTime(event.time)} ${event.title}`;
  }

  eventElement.style.backgroundColor = event.color;

  // Add context menu for edit/delete
  eventElement.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showEventContextMenu(e, event);
  });

  // Drag events
  eventElement.addEventListener("dragstart", (e) => {
    draggedEvent = event;
    e.dataTransfer.setData("text/plain", event.id);
    setTimeout(() => eventElement.classList.add("dragging"), 0);
  });

  eventElement.addEventListener("dragend", () => {
    eventElement.classList.remove("dragging");
  });

  // Click to view details
  eventElement.addEventListener("click", () => showEventDetails(event));

  return eventElement;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  this.classList.add("drop-target");
}

async function handleDrop(e) {
  e.preventDefault();
  this.classList.remove("drop-target");

  if (!draggedEvent) return;

  // Calculate new date and time
  const newDate = this.dataset.date || draggedEvent.date;
  let newTime = draggedEvent.time;

  if (this.dataset.hour !== undefined) {
    const minutes = newTime.split(":")[1] || "00";
    newTime = `${this.dataset.hour}:${minutes}`;
  }

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    await db
      .collection(`users/${user.uid}/events`)
      .doc(draggedEvent.id)
      .update({
        date: newDate,
        time: newTime,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
  } catch (error) {
    console.error("Error moving event:", error);
    alert("Error moving event: " + error.message);
  }
}

function showEventContextMenu(e, event) {
  // Remove any existing context menu
  const existingMenu = document.querySelector(".context-menu");
  if (existingMenu) existingMenu.remove();

  // Create menu
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.top = `${e.clientY}px`;
  menu.style.left = `${e.clientX}px`;

  // Edit option
  const editOption = document.createElement("div");
  editOption.textContent = "✏️ Edit Event";
  editOption.addEventListener("click", () => {
    openEventModal(event);
    menu.remove();
  });

  // Delete option
  const deleteOption = document.createElement("div");
  deleteOption.textContent = "🗑️ Delete Event";
  deleteOption.addEventListener("click", () => {
    deleteEvent(event.id);
    menu.remove();
  });

  menu.appendChild(editOption);
  menu.appendChild(deleteOption);
  document.body.appendChild(menu);

  // Close menu when clicking elsewhere
  const closeMenu = () => {
    menu.remove();
    document.removeEventListener("click", closeMenu);
  };

  setTimeout(() => {
    document.addEventListener("click", closeMenu);
  }, 100);
}

// ======================
// NAVIGATION FUNCTIONS
// ======================

function navigatePrevious() {
  switch (currentView) {
    case "day":
      currentDate.setDate(currentDate.getDate() - 1);
      break;
    case "week":
      currentDate.setDate(currentDate.getDate() - 7);
      break;
    case "month":
      currentDate.setMonth(currentDate.getMonth() - 1);
      break;
  }
  renderCurrentView();
}

function navigateNext() {
  switch (currentView) {
    case "day":
      currentDate.setDate(currentDate.getDate() + 1);
      break;
    case "week":
      currentDate.setDate(currentDate.getDate() + 7);
      break;
    case "month":
      currentDate.setMonth(currentDate.getMonth() + 1);
      break;
  }
  renderCurrentView();
}

// ======================
// UPCOMING EVENTS
// ======================

function renderUpcomingEvents() {
  eventsList.innerHTML = "";

  const sortedEvents = [...events].sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time}`);
    const dateB = new Date(`${b.date}T${b.time}`);
    return dateA - dateB;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingEvents = sortedEvents.filter((event) => {
    const eventDate = new Date(event.date);
    return eventDate >= today;
  });

  upcomingEvents.slice(0, 5).forEach((event) => {
    const eventElement = document.createElement("div");
    eventElement.className = "event-card";
    eventElement.innerHTML = `
      <div class="event-time">${formatTime(event.time)}</div>
      <div class="event-details">
        <h4>${event.title}</h4>
        <p>${formatDate(event.date)}</p>
        ${
          event.description
            ? `<p class="event-description">${event.description}</p>`
            : ""
        }
      </div>
      <div class="event-actions">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </div>
    `;

    eventElement.querySelector(".edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openEventModal(event);
    });

    eventElement.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteEvent(event.id);
    });

    eventElement.addEventListener("click", () => showEventDetails(event));
    eventsList.appendChild(eventElement);
  });
}

// ======================
// HELPER FUNCTIONS
// ======================

function formatDateForStorage(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(timeStr) {
  const [hours, minutes] = timeStr.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function formatDate(dateStr) {
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

function showEventDetails(event) {
  alert(
    `Event: ${event.title}\nDate: ${formatDate(event.date)}\nTime: ${formatTime(
      event.time
    )}\nDescription: ${event.description || "None"}`
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

// ======================
// THEME FUNCTIONS
// ======================

function toggleTheme() {
  document.body.classList.toggle("dark-theme");
  document.body.classList.toggle("light-theme");
  localStorage.setItem(
    "themePreference",
    document.body.classList.contains("dark-theme") ? "dark" : "light"
  );
}

function loadThemePreference() {
  const savedTheme = localStorage.getItem("themePreference") || "light";
  document.body.classList.add(
    savedTheme === "dark" ? "dark-theme" : "light-theme"
  );
}

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", init);
