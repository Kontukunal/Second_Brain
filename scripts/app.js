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
let events = JSON.parse(localStorage.getItem("calendarEvents")) || [];
let currentEventId = null; // For edit mode
let draggedEvent = null;

// Initialize the app
function init() {
  // Set initial view
  switchView(currentView);

  // Set up event listeners
  setupEventListeners();

  // Render initial data
  renderUpcomingEvents();
  updateCurrentDate();

  // Load theme preference
  loadThemePreference();
}

// Set up event listeners
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

// Open event modal (for add or edit)
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

// Close event modal
function closeEventModal() {
  eventModal.style.display = "none";
}

// Handle event form submission
function handleEventSubmit(e) {
  e.preventDefault();

  const event = {
    id: currentEventId || Date.now().toString(),
    title: eventTitle.value,
    date: eventDate.value,
    time: eventTime.value,
    description: eventDescription.value,
    color: eventColor.value,
  };

  if (currentEventId) {
    // Update existing event
    const index = events.findIndex((e) => e.id === currentEventId);
    if (index !== -1) {
      events[index] = event;
    }
  } else {
    // Add new event
    events.push(event);
  }

  saveEvents();
  renderCurrentView();
  renderUpcomingEvents();
  closeEventModal();
}

// Switch between calendar views
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

// Render the current active view
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

// Render day view with drag-and-drop
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

// Render week view with drag-and-drop
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

// Render month view with drag-and-drop
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

  // Add empty cells
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

// Create event element with drag-and-drop and edit/delete actions
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

// Drag and drop handlers
function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  this.classList.add("drop-target");
}

function handleDrop(e) {
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

  // Update event
  const index = events.findIndex((e) => e.id === draggedEvent.id);
  if (index !== -1) {
    events[index] = {
      ...events[index],
      date: newDate,
      time: newTime,
    };
    saveEvents();
    renderCurrentView();
    renderUpcomingEvents();
  }
}

// Show context menu for event actions
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

// Navigation functions
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

// Theme functions
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

// Helper functions
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

function formatDate(dateStr) {
  const options = { weekday: "short", month: "short", day: "numeric" };
  return new Date(dateStr).toLocaleDateString("en-US", options);
}

function showEventDetails(event) {
  alert(
    `Event: ${event.title}\nDate: ${formatDate(event.date)}\nTime: ${formatTime(
      event.time
    )}\nDescription: ${event.description || "None"}`
  );
}

function deleteEvent(id) {
  if (confirm("Are you sure you want to delete this event?")) {
    events = events.filter((event) => event.id !== id);
    saveEvents();
    renderCurrentView();
    renderUpcomingEvents();
  }
}

function saveEvents() {
  localStorage.setItem("calendarEvents", JSON.stringify(events));
}

// Initialize the app
document.addEventListener("DOMContentLoaded", init);
