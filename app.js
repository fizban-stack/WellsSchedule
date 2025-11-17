// API Configuration
const API_BASE = 'api/index.php';

// API Helper Functions
async function apiGet(endpoint) {
    const response = await fetch(`${API_BASE}/${endpoint}`);
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return await response.json();
}

async function apiPost(endpoint, data) {
    const response = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return await response.json();
}

async function apiPut(endpoint, data) {
    const response = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return await response.json();
}

async function apiDelete(endpoint) {
    const response = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return await response.json();
}

// Calendar state
let currentWeekStart = getStartOfWeek(new Date());
let calendarEntries = {};
let chores = {};
let recurringEntries = [];
let recurringChores = [];
let gcalConfig = null;
let gcalEvents = {};
let monthlyCompletions = {};

// Keep track of database IDs for chores and entries
let choresIdMap = {}; // Maps date_index to database ID
let entriesIdMap = {}; // Maps date_index to database ID
let choreValues = {}; // Maps chore names to dollar values
let choreValuesIdMap = {}; // Maps chore name to database ID

// Family member color mapping
const familyColors = {
    'dad': '#4285f4',
    'mom': '#9b59b6',
    'karma': '#e74c3c',
    'ben': '#27ae60',
    'jasmine': '#ff69b4'
};

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await loadAllData();
        checkAndResetMonthlyCompletions();
        await processRecurringItems();
        renderCalendar();
        renderCompletionChart();
        renderChoreValueGrid();
        setupEventListeners();
        updateDateTime();
        // Update time every second
        setInterval(updateDateTime, 1000);
        // Check if Google Calendar is configured
        checkGcalConfig();
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        alert('Failed to load dashboard data. Please refresh the page.');
    }
});

// Load all data from API
async function loadAllData() {
    try {
        // Load calendar entries
        const entriesData = await apiGet('entries');
        calendarEntries = {};
        entriesIdMap = {};
        entriesData.forEach(entry => {
            const date = entry.entry_date;
            if (!calendarEntries[date]) {
                calendarEntries[date] = [];
            }
            const index = calendarEntries[date].length;
            entriesIdMap[`${date}_${index}`] = entry.id;
            calendarEntries[date].push({
                title: entry.title,
                time: entry.time,
                description: entry.description,
                assignedTo: entry.assigned_to,
                recurring: Boolean(entry.recurring),
                recurId: entry.recur_id
            });
        });

        // Load chores
        const choresData = await apiGet('chores');
        chores = {};
        choresIdMap = {};
        choresData.forEach(chore => {
            const date = chore.chore_date;
            if (!chores[date]) {
                chores[date] = [];
            }
            const index = chores[date].length;
            choresIdMap[`${date}_${index}`] = chore.id;
            chores[date].push({
                text: chore.text,
                assignedTo: chore.assigned_to,
                completed: Boolean(chore.completed),
                recurring: Boolean(chore.recurring),
                recurId: chore.recur_id
            });
        });

        // Load recurring entries
        const recurringEntriesData = await apiGet('recurring-entries');
        recurringEntries = recurringEntriesData.map(entry => ({
            id: entry.id,
            title: entry.title,
            time: entry.time,
            description: entry.description,
            assignedTo: entry.assigned_to,
            startDate: entry.start_date,
            endDate: entry.end_date,
            frequency: entry.frequency
        }));

        // Load recurring chores
        const recurringChoresData = await apiGet('recurring-chores');
        recurringChores = recurringChoresData.map(chore => ({
            id: chore.id,
            text: chore.text,
            assignedTo: chore.assigned_to,
            startDate: chore.start_date,
            endDate: chore.end_date,
            frequency: chore.frequency
        }));

        // Load monthly completions
        monthlyCompletions = await apiGet('completions');

        // Load Google Calendar config
        gcalConfig = await apiGet('gcal-config');

        // Load chore values
        try {
            const choreValuesData = await apiGet('chore-values');
            choreValues = {};
            choreValuesIdMap = {};
            if (choreValuesData && Array.isArray(choreValuesData)) {
                choreValuesData.forEach(cv => {
                    choreValues[cv.chore_name] = parseFloat(cv.dollar_value);
                    choreValuesIdMap[cv.chore_name] = cv.id;
                });
            }
        } catch (error) {
            console.warn('Could not load chore values:', error);
            choreValues = {};
            choreValuesIdMap = {};
        }
    } catch (error) {
        console.error('Error loading data:', error);
        throw error;
    }
}

// Get start of current week (Sunday)
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
}

// Format date as YYYY-MM-DD
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// Get day name
function getDayName(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
}

// Get month and day
function getMonthDay(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get current month key (YYYY-MM format)
function getCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

// Format time from 24hr (HH:MM) to 12hr (h:MM AM/PM)
function formatTime12hr(time24) {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    let hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12; // Convert 0 to 12 for midnight, 13-23 to 1-11
    return `${hour}:${minutes} ${ampm}`;
}

// Check and reset monthly completions if new month
function checkAndResetMonthlyCompletions() {
    const currentMonth = getCurrentMonth();
    const lastMonth = localStorage.getItem('lastTrackedMonth'); // Keep this in localStorage for client-side tracking

    if (lastMonth && lastMonth !== currentMonth) {
        // New month started - don't delete old data, just ensure current month exists
        if (!monthlyCompletions[currentMonth]) {
            monthlyCompletions[currentMonth] = {};
        }
    }

    localStorage.setItem('lastTrackedMonth', currentMonth);
}

// Update current date and time display
function updateDateTime() {
    const now = new Date();
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    document.getElementById('currentDateTime').textContent = now.toLocaleString('en-US', options);
}

// Render the week calendar
function renderCalendar() {
    const calendar = document.getElementById('weekCalendar');
    calendar.innerHTML = '';

    // Update week range display
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    document.getElementById('weekRange').textContent =
        `${getMonthDay(currentWeekStart)} - ${getMonthDay(weekEnd)}`;

    // Create 7 day columns
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + i);
        const dateStr = formatDate(date);

        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';

        // Check if it's today
        const today = formatDate(new Date());
        if (dateStr === today) {
            dayColumn.classList.add('today');
        }

        // Day header
        const header = document.createElement('div');
        header.className = 'day-header';
        header.innerHTML = `
            <div class="day-name">${getDayName(date)}</div>
            <div class="day-date">${getMonthDay(date)}</div>
        `;
        dayColumn.appendChild(header);

        // Weather section
        const weatherSection = document.createElement('div');
        weatherSection.className = 'weather-section';
        weatherSection.innerHTML = '<div class="weather-loading">Loading weather...</div>';
        dayColumn.appendChild(weatherSection);

        // Load weather for this day
        loadWeather(date, weatherSection);

        // Events section wrapper (similar to chores section)
        const eventsWrapper = document.createElement('div');
        eventsWrapper.className = 'events-section';

        const eventsHeader = document.createElement('div');
        eventsHeader.className = 'events-header';
        eventsHeader.textContent = 'Events';
        eventsWrapper.appendChild(eventsHeader);

        // Entries section
        const entriesSection = document.createElement('div');
        entriesSection.className = 'entries-section';

        // Display Google Calendar events first (read-only)
        if (gcalEvents[dateStr]) {
            gcalEvents[dateStr].forEach((event) => {
                const entryEl = createEntryElement(event, dateStr, -1, true);
                entriesSection.appendChild(entryEl);
            });
        }

        // Display existing manual entries
        if (calendarEntries[dateStr]) {
            calendarEntries[dateStr].forEach((entry, index) => {
                const entryEl = createEntryElement(entry, dateStr, index, false);
                entriesSection.appendChild(entryEl);
            });
        }

        eventsWrapper.appendChild(entriesSection);

        // Add entry button
        const addBtn = document.createElement('button');
        addBtn.className = 'add-entry-btn';
        addBtn.textContent = '+ Enter Event';
        addBtn.onclick = () => openEntryModal(dateStr);
        eventsWrapper.appendChild(addBtn);

        dayColumn.appendChild(eventsWrapper);

        // Chores section
        const choresSection = document.createElement('div');
        choresSection.className = 'chores-section';

        const choresHeader = document.createElement('div');
        choresHeader.className = 'chores-header';
        choresHeader.textContent = 'Chores';
        choresSection.appendChild(choresHeader);

        const choresList = document.createElement('div');
        choresList.className = 'chores-list';

        // Display existing chores for this day
        if (chores[dateStr]) {
            chores[dateStr].forEach((chore, index) => {
                const choreEl = createChoreElement(chore, dateStr, index);
                choresList.appendChild(choreEl);
            });
        }

        choresSection.appendChild(choresList);

        // Add chore button
        const addChoreBtn = document.createElement('button');
        addChoreBtn.className = 'add-chore-btn';
        addChoreBtn.textContent = '+ Enter Chore';
        addChoreBtn.onclick = () => openChoreModal(dateStr);
        choresSection.appendChild(addChoreBtn);

        dayColumn.appendChild(choresSection);

        calendar.appendChild(dayColumn);
    }
}

// Create entry element
function createEntryElement(entry, date, index, isGoogleEvent = false) {
    const entryEl = document.createElement('div');
    entryEl.className = 'entry-item' + (isGoogleEvent ? ' gcal-entry' : '');

    // Apply family member color if assigned
    if (entry.assignedTo && familyColors[entry.assignedTo]) {
        entryEl.style.borderLeftColor = familyColors[entry.assignedTo];
        // Add subtle background tint (20% opacity of the color)
        const color = familyColors[entry.assignedTo];
        entryEl.style.backgroundColor = color + '33'; // 33 in hex = 20% opacity
    }

    let actionButtons = '';
    if (!isGoogleEvent) {
        if (entry.recurring && entry.recurId) {
            // Recurring entry - show edit, delete, stop future, and delete all buttons
            actionButtons = `
                <button class="edit-entry" onclick="editEntry('${date}', ${index})" title="Edit this entry">✎</button>
                <button class="delete-entry" onclick="deleteEntry('${date}', ${index})" title="Delete this occurrence">×</button>
                <button class="stop-future-entry" onclick="stopFutureRecurringEntries('${entry.recurId}', '${date}')" title="Stop future occurrences">⏸</button>
                <button class="delete-all-entry" onclick="deleteAllRecurringEntries('${entry.recurId}')" title="Delete all occurrences">⊗</button>
            `;
        } else {
            // Regular entry - show edit and delete buttons
            actionButtons = `
                <button class="edit-entry" onclick="editEntry('${date}', ${index})" title="Edit entry">✎</button>
                <button class="delete-entry" onclick="deleteEntry('${date}', ${index})" title="Delete entry">×</button>
            `;
        }
    }

    const googleBadge = isGoogleEvent ? '<span class="gcal-badge">📅</span>' : '';
    const recurringBadge = entry.recurring ? '<span class="recurring-badge" title="Recurring">↻</span>' : '';
    const formattedTime = formatTime12hr(entry.time);

    entryEl.innerHTML = `
        ${googleBadge}
        ${recurringBadge}
        <div class="entry-time">${formattedTime}</div>
        <div class="entry-title">${entry.title}</div>
        ${entry.description ? `<div class="entry-description">${entry.description}</div>` : ''}
        ${actionButtons}
    `;
    return entryEl;
}

// Load weather data
async function loadWeather(date, weatherSection) {
    try {
        // Using Open-Meteo API (free, no API key needed)
        // For a real implementation, you'd want to get user's location
        const lat = 38.234203; // Default to New York
        const lon = -86.138660;

        const dateStr = formatDate(date);
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=America/Kentucky/Louisville&temperature_unit=fahrenheit&start_date=${dateStr}&end_date=${dateStr}`
        );

        const data = await response.json();

        if (data.daily) {
            const tempMax = Math.round(data.daily.temperature_2m_max[0]);
            const tempMin = Math.round(data.daily.temperature_2m_min[0]);
            const weatherCode = data.daily.weathercode[0];
            const weatherInfo = getWeatherInfo(weatherCode);

            weatherSection.innerHTML = `
                <div class="weather-icon">${weatherInfo.icon}</div>
                <div class="weather-temp">${tempMax}° / ${tempMin}°</div>
                <div class="weather-description">${weatherInfo.description}</div>
            `;
        }
    } catch (error) {
        console.error('Error loading weather:', error);
        weatherSection.innerHTML = '<div class="weather-error">Weather unavailable</div>';
    }
}

// Process recurring items and generate instances
async function processRecurringItems() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Process recurring entries
    for (const recurEntry of recurringEntries) {
        const startDate = new Date(recurEntry.startDate);
        const endDate = recurEntry.endDate ? new Date(recurEntry.endDate) : new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);

        await generateRecurringInstances(startDate, endDate, recurEntry.frequency, async (date) => {
            const dateStr = formatDate(date);
            if (!calendarEntries[dateStr]) {
                calendarEntries[dateStr] = [];
            }

            // Check if this instance already exists
            const exists = calendarEntries[dateStr].some(entry =>
                entry.title === recurEntry.title &&
                entry.time === recurEntry.time &&
                entry.recurring === true
            );

            if (!exists) {
                // Save to database
                try {
                    await apiPost('entries', {
                        date: dateStr,
                        title: recurEntry.title,
                        time: recurEntry.time,
                        description: recurEntry.description,
                        assignedTo: recurEntry.assignedTo,
                        recurring: 1,
                        recurId: recurEntry.id
                    });

                    calendarEntries[dateStr].push({
                        title: recurEntry.title,
                        time: recurEntry.time,
                        description: recurEntry.description,
                        assignedTo: recurEntry.assignedTo,
                        recurring: true,
                        recurId: recurEntry.id
                    });
                    calendarEntries[dateStr].sort((a, b) => a.time.localeCompare(b.time));
                } catch (error) {
                    console.error('Error creating recurring entry instance:', error);
                }
            }
        });
    }

    // Process recurring chores
    for (const recurChore of recurringChores) {
        const startDate = new Date(recurChore.startDate);
        const endDate = recurChore.endDate ? new Date(recurChore.endDate) : new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);

        await generateRecurringInstances(startDate, endDate, recurChore.frequency, async (date) => {
            const dateStr = formatDate(date);
            if (!chores[dateStr]) {
                chores[dateStr] = [];
            }

            // Check if this instance already exists
            const exists = chores[dateStr].some(chore =>
                chore.text === recurChore.text &&
                chore.recurring === true
            );

            if (!exists) {
                // Save to database
                try {
                    await apiPost('chores', {
                        date: dateStr,
                        text: recurChore.text,
                        assignedTo: recurChore.assignedTo,
                        completed: 0,
                        recurring: 1,
                        recurId: recurChore.id
                    });

                    chores[dateStr].push({
                        text: recurChore.text,
                        assignedTo: recurChore.assignedTo,
                        completed: false,
                        recurring: true,
                        recurId: recurChore.id
                    });
                } catch (error) {
                    console.error('Error creating recurring chore instance:', error);
                }
            }
        });
    }
}

// Generate recurring instances
async function generateRecurringInstances(startDate, endDate, frequency, callback) {
    const current = new Date(startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start from 30 days ago to ensure past instances are visible
    const startLimit = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    while (current <= endDate && current <= new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000)) {
        if (current >= startLimit) {
            await callback(new Date(current));
        }

        switch (frequency) {
            case 'daily':
                current.setDate(current.getDate() + 1);
                break;
            case 'weekly':
                current.setDate(current.getDate() + 7);
                break;
            case 'monthly':
                current.setMonth(current.getMonth() + 1);
                break;
        }
    }
}

// Get weather info from code
function getWeatherInfo(code) {
    const weatherCodes = {
        0: { icon: '☀️', description: 'Clear sky' },
        1: { icon: '🌤️', description: 'Mainly clear' },
        2: { icon: '⛅', description: 'Partly cloudy' },
        3: { icon: '☁️', description: 'Overcast' },
        45: { icon: '🌫️', description: 'Foggy' },
        48: { icon: '🌫️', description: 'Foggy' },
        51: { icon: '🌦️', description: 'Light drizzle' },
        53: { icon: '🌦️', description: 'Drizzle' },
        55: { icon: '🌧️', description: 'Heavy drizzle' },
        61: { icon: '🌧️', description: 'Light rain' },
        63: { icon: '🌧️', description: 'Rain' },
        65: { icon: '🌧️', description: 'Heavy rain' },
        71: { icon: '🌨️', description: 'Light snow' },
        73: { icon: '🌨️', description: 'Snow' },
        75: { icon: '🌨️', description: 'Heavy snow' },
        77: { icon: '🌨️', description: 'Snow grains' },
        80: { icon: '🌦️', description: 'Light showers' },
        81: { icon: '🌧️', description: 'Showers' },
        82: { icon: '🌧️', description: 'Heavy showers' },
        85: { icon: '🌨️', description: 'Light snow showers' },
        86: { icon: '🌨️', description: 'Snow showers' },
        95: { icon: '⛈️', description: 'Thunderstorm' },
        96: { icon: '⛈️', description: 'Thunderstorm with hail' },
        99: { icon: '⛈️', description: 'Heavy thunderstorm' }
    };

    return weatherCodes[code] || { icon: '🌡️', description: 'Unknown' };
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('prevWeek').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        renderCalendar();
    });

    document.getElementById('nextWeek').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        renderCalendar();
    });

    // Entry modal controls
    const entryModal = document.getElementById('entryModal');
    const entryCloseBtn = document.getElementById('entryClose');

    entryCloseBtn.onclick = () => {
        entryModal.style.display = 'none';
    };

    // Form submission
    document.getElementById('entryForm').addEventListener('submit', (e) => {
        e.preventDefault();
        addEntry();
    });

    // Handle recurring checkbox
    document.getElementById('entryRecurring').addEventListener('change', (e) => {
        document.getElementById('recurringOptions').style.display = e.target.checked ? 'block' : 'none';
    });

    // Setup Google Calendar handlers
    setupGcalModalHandlers();

    // Setup chore modal handlers
    setupChoreModalHandlers();

    // Setup chore value modal handlers
    setupChoreValueModalHandlers();

    // Consolidated window click handler for all modals
    window.onclick = (event) => {
        if (event.target === entryModal) {
            entryModal.style.display = 'none';
        }
        const gcalModal = document.getElementById('gcalModal');
        if (event.target === gcalModal) {
            gcalModal.style.display = 'none';
        }
        const choreModal = document.getElementById('choreModal');
        if (event.target === choreModal) {
            choreModal.style.display = 'none';
        }
        const choreValueModal = document.getElementById('choreValueModal');
        if (event.target === choreValueModal) {
            choreValueModal.style.display = 'none';
        }
    };
}

// Open entry modal
function openEntryModal(date) {
    const modal = document.getElementById('entryModal');

    // Clear edit mode
    delete modal.dataset.editMode;
    delete modal.dataset.editDate;
    delete modal.dataset.editIndex;

    document.getElementById('entryDate').value = date;
    document.getElementById('entryTitle').value = '';
    document.getElementById('entryTime').value = '';
    document.getElementById('entryDescription').value = '';
    document.getElementById('entryAssignedTo').value = '';
    document.getElementById('entryRecurring').checked = false;
    document.getElementById('recurringOptions').style.display = 'none';
    document.getElementById('recurFrequency').value = 'daily';
    document.getElementById('recurEndDate').value = '';
    modal.style.display = 'block';
}

// Add new entry
async function addEntry() {
    const modal = document.getElementById('entryModal');
    const date = document.getElementById('entryDate').value;
    const title = document.getElementById('entryTitle').value;
    const time = document.getElementById('entryTime').value;
    const description = document.getElementById('entryDescription').value;
    const assignedTo = document.getElementById('entryAssignedTo').value;
    const isRecurring = document.getElementById('entryRecurring').checked;

    try {
        // Check if we're in edit mode
        if (modal.dataset.editMode === 'true') {
            const editDate = modal.dataset.editDate;
            const editIndex = parseInt(modal.dataset.editIndex);

            // Check if user wants to convert to recurring
            if (isRecurring) {
                const frequency = document.getElementById('recurFrequency').value;
                const endDate = document.getElementById('recurEndDate').value;

                // Delete the old single entry
                const dbId = entriesIdMap[`${editDate}_${editIndex}`];
                if (dbId) {
                    await apiDelete(`entries/${dbId}`);
                }
                calendarEntries[editDate].splice(editIndex, 1);
                if (calendarEntries[editDate].length === 0) {
                    delete calendarEntries[editDate];
                }

                // Create recurring entry
                const recurringEntry = {
                    id: Date.now().toString(),
                    title,
                    time,
                    description,
                    assignedTo,
                    startDate: editDate,
                    endDate: endDate || null,
                    frequency
                };

                // Save to database
                await apiPost('recurring-entries', recurringEntry);
                recurringEntries.push(recurringEntry);

                // Reload all data and regenerate instances
                await loadAllData();
                await processRecurringItems();
            } else {
                // Just update the existing entry
                calendarEntries[editDate][editIndex] = {
                    ...calendarEntries[editDate][editIndex],
                    title,
                    time,
                    description,
                    assignedTo
                };

                // Update in database
                const dbId = entriesIdMap[`${editDate}_${editIndex}`];
                if (dbId) {
                    await apiPut(`entries/${dbId}`, {
                        title,
                        time,
                        description,
                        assignedTo
                    });
                }

                // Sort entries by time
                calendarEntries[editDate].sort((a, b) => a.time.localeCompare(b.time));
            }

            // Clear edit mode
            delete modal.dataset.editMode;
            delete modal.dataset.editDate;
            delete modal.dataset.editIndex;
        } else if (isRecurring) {
            const frequency = document.getElementById('recurFrequency').value;
            const endDate = document.getElementById('recurEndDate').value;

            // Create recurring entry
            const recurringEntry = {
                id: Date.now().toString(),
                title,
                time,
                description,
                assignedTo,
                startDate: date,
                endDate: endDate || null,
                frequency
            };

            // Save to database
            await apiPost('recurring-entries', recurringEntry);
            recurringEntries.push(recurringEntry);

            // Reload all data and regenerate instances
            await loadAllData();
            await processRecurringItems();
        } else {
            // Add single entry
            const result = await apiPost('entries', {
                date,
                title,
                time,
                description,
                assignedTo,
                recurring: 0,
                recurId: null
            });

            if (!calendarEntries[date]) {
                calendarEntries[date] = [];
            }

            const index = calendarEntries[date].length;
            entriesIdMap[`${date}_${index}`] = result.id;

            calendarEntries[date].push({
                title,
                time,
                description,
                assignedTo
            });

            // Sort entries by time
            calendarEntries[date].sort((a, b) => a.time.localeCompare(b.time));
        }

        // Close modal and refresh calendar
        document.getElementById('entryModal').style.display = 'none';
        renderCalendar();
    } catch (error) {
        console.error('Error adding entry:', error);
        alert('Failed to add entry. Please try again.');
    }
}

// Delete entry
async function deleteEntry(date, index) {
    if (confirm('Are you sure you want to delete this entry?')) {
        try {
            const dbId = entriesIdMap[`${date}_${index}`];
            if (dbId) {
                await apiDelete(`entries/${dbId}`);
            }

            calendarEntries[date].splice(index, 1);
            if (calendarEntries[date].length === 0) {
                delete calendarEntries[date];
            }
            renderCalendar();
        } catch (error) {
            console.error('Error deleting entry:', error);
            alert('Failed to delete entry. Please try again.');
        }
    }
}

async function deleteAllRecurringEntries(recurId) {
    if (confirm('Are you sure you want to delete ALL occurrences of this recurring entry?')) {
        try {
            // Delete from database (API will delete both recurring template and all instances)
            await apiDelete(`recurring-entries/${recurId}`);

            // Reload all data and regenerate recurring items
            await loadAllData();
            await processRecurringItems();
            renderCalendar();
        } catch (error) {
            console.error('Error deleting recurring entries:', error);
            alert('Failed to delete recurring entries. Please try again.');
        }
    }
}

// Stop future recurring entries (set end date to today or specified date)
async function stopFutureRecurringEntries(recurId, fromDate) {
    if (confirm('Are you sure you want to stop all future occurrences of this recurring entry?')) {
        try {
            // Find the recurring entry template
            const recurEntry = recurringEntries.find(r => r.id === recurId);
            if (!recurEntry) {
                alert('Recurring entry template not found.');
                return;
            }

            // Calculate the end date (day before the fromDate)
            const stopDate = new Date(fromDate);
            stopDate.setDate(stopDate.getDate() - 1);
            const endDate = formatDate(stopDate);

            // Update the recurring entry to set end date
            await apiPut(`recurring-entries/${recurId}`, {
                endDate: endDate
            });

            // Delete all future instances (dates after fromDate)
            for (const dateStr in calendarEntries) {
                if (dateStr >= fromDate) {
                    const entries = calendarEntries[dateStr];
                    for (let i = entries.length - 1; i >= 0; i--) {
                        if (entries[i].recurId === recurId) {
                            const dbId = entriesIdMap[`${dateStr}_${i}`];
                            if (dbId) {
                                await apiDelete(`entries/${dbId}`);
                            }
                        }
                    }
                }
            }

            // Reload all data
            await loadAllData();
            await processRecurringItems();
            renderCalendar();
        } catch (error) {
            console.error('Error stopping future recurring entries:', error);
            alert('Failed to stop future occurrences. Please try again.');
        }
    }
}

// Edit entry
function editEntry(date, index) {
    if (calendarEntries[date] && calendarEntries[date][index]) {
        const entry = calendarEntries[date][index];
        const modal = document.getElementById('entryModal');

        // Store the edit info in the modal
        modal.dataset.editMode = 'true';
        modal.dataset.editDate = date;
        modal.dataset.editIndex = index;

        // Populate form with existing data
        document.getElementById('entryDate').value = date;
        document.getElementById('entryTitle').value = entry.title;
        document.getElementById('entryTime').value = entry.time;
        document.getElementById('entryDescription').value = entry.description || '';
        document.getElementById('entryAssignedTo').value = entry.assignedTo || '';

        // Allow enabling recurring for existing entries
        document.getElementById('entryRecurring').checked = false;
        document.getElementById('recurringOptions').style.display = 'none';
        document.getElementById('recurFrequency').value = 'daily';
        document.getElementById('recurEndDate').value = '';

        modal.style.display = 'block';
    }
}

// Create chore element
function createChoreElement(chore, date, index) {
    const choreEl = document.createElement('div');
    choreEl.className = 'chore-item' + (chore.completed ? ' completed' : '');

    // Apply family member color if assigned
    if (chore.assignedTo && familyColors[chore.assignedTo]) {
        choreEl.style.borderLeft = `3px solid ${familyColors[chore.assignedTo]}`;
        // Add subtle background tint (20% opacity of the color)
        const color = familyColors[chore.assignedTo];
        choreEl.style.backgroundColor = color + '33'; // 33 in hex = 20% opacity
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'chore-checkbox';
    checkbox.checked = chore.completed;
    checkbox.onchange = () => toggleChore(date, index);

    const choreText = document.createElement('span');
    choreText.className = 'chore-text';
    choreText.textContent = chore.text;

    // Add recurring badge if this is a recurring chore
    if (chore.recurring && chore.recurId) {
        const recurringBadge = document.createElement('span');
        recurringBadge.className = 'recurring-badge';
        recurringBadge.textContent = '↻';
        recurringBadge.title = 'Recurring';
        choreEl.appendChild(recurringBadge);
    }

    choreEl.appendChild(checkbox);
    choreEl.appendChild(choreText);

    // Add action buttons - show edit and delete buttons
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-chore';
    editBtn.textContent = '✎';
    editBtn.title = 'Edit chore';
    editBtn.onclick = () => editChore(date, index);
    choreEl.appendChild(editBtn);

    if (chore.recurring && chore.recurId) {
        const deleteSingleBtn = document.createElement('button');
        deleteSingleBtn.className = 'delete-chore';
        deleteSingleBtn.textContent = '×';
        deleteSingleBtn.title = 'Delete this occurrence';
        deleteSingleBtn.onclick = () => deleteChore(date, index);
        choreEl.appendChild(deleteSingleBtn);

        const stopFutureBtn = document.createElement('button');
        stopFutureBtn.className = 'stop-future-chore';
        stopFutureBtn.textContent = '⏸';
        stopFutureBtn.title = 'Stop future occurrences';
        stopFutureBtn.onclick = () => stopFutureRecurringChores(chore.recurId, date);
        choreEl.appendChild(stopFutureBtn);

        const deleteAllBtn = document.createElement('button');
        deleteAllBtn.className = 'delete-all-chore';
        deleteAllBtn.textContent = '⊗';
        deleteAllBtn.title = 'Delete all occurrences';
        deleteAllBtn.onclick = () => deleteAllRecurringChores(chore.recurId);
        choreEl.appendChild(deleteAllBtn);
    } else {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-chore';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete chore';
        deleteBtn.onclick = () => deleteChore(date, index);
        choreEl.appendChild(deleteBtn);
    }

    return choreEl;
}

// Add new chore
function addChore(date, text, isRecurring = false) {
    if (!chores[date]) {
        chores[date] = [];
    }

    chores[date].push({
        text: text,
        completed: false,
        recurring: isRecurring
    });

    localStorage.setItem('chores', JSON.stringify(chores));
    renderCalendar();
}

// Setup chore modal handlers
function setupChoreModalHandlers() {
    const choreModal = document.getElementById('choreModal');
    const choreCloseBtn = document.getElementById('choreClose');
    const choreForm = document.getElementById('choreForm');

    choreCloseBtn.onclick = () => {
        choreModal.style.display = 'none';
    };

    // Handle recurring checkbox
    document.getElementById('choreRecurring').addEventListener('change', (e) => {
        document.getElementById('choreRecurringOptions').style.display = e.target.checked ? 'block' : 'none';
    });

    // Form submission
    choreForm.addEventListener('submit', (e) => {
        e.preventDefault();
        addChoreFromModal();
    });
}

// Open chore modal
function openChoreModal(date) {
    const modal = document.getElementById('choreModal');

    // Clear edit mode
    delete modal.dataset.editMode;
    delete modal.dataset.editDate;
    delete modal.dataset.editIndex;

    document.getElementById('choreDate').value = date;
    document.getElementById('choreText').value = '';
    document.getElementById('choreAssignedTo').value = '';
    document.getElementById('choreRecurring').checked = false;
    document.getElementById('choreRecurringOptions').style.display = 'none';
    document.getElementById('choreFrequency').value = 'daily';
    document.getElementById('choreEndDate').value = '';
    modal.style.display = 'block';
}

// Add chore from modal
async function addChoreFromModal() {
    const modal = document.getElementById('choreModal');
    const date = document.getElementById('choreDate').value;
    const text = document.getElementById('choreText').value;
    const assignedTo = document.getElementById('choreAssignedTo').value;
    const isRecurring = document.getElementById('choreRecurring').checked;

    try {
        // Check if we're in edit mode
        if (modal.dataset.editMode === 'true') {
            const editDate = modal.dataset.editDate;
            const editIndex = parseInt(modal.dataset.editIndex);

            // Update the chore in memory
            chores[editDate][editIndex].text = text;
            chores[editDate][editIndex].assignedTo = assignedTo;

            // Update in database
            const dbId = choresIdMap[`${editDate}_${editIndex}`];
            if (dbId) {
                await apiPut(`chores/${dbId}`, {
                    text,
                    assignedTo
                });
            }

            // Clear edit mode
            delete modal.dataset.editMode;
            delete modal.dataset.editDate;
            delete modal.dataset.editIndex;
        } else if (isRecurring) {
            const frequency = document.getElementById('choreFrequency').value;
            const endDate = document.getElementById('choreEndDate').value;

            // Create recurring chore
            const recurringChore = {
                id: Date.now().toString(),
                text: text,
                assignedTo: assignedTo,
                startDate: date,
                endDate: endDate || null,
                frequency: frequency
            };

            // Save to database
            await apiPost('recurring-chores', recurringChore);
            recurringChores.push(recurringChore);

            // Reload all data and regenerate instances
            await loadAllData();
            await processRecurringItems();
        } else {
            // Add single chore
            const result = await apiPost('chores', {
                date,
                text: text,
                assignedTo: assignedTo,
                completed: 0,
                recurring: 0,
                recurId: null
            });

            if (!chores[date]) {
                chores[date] = [];
            }

            const index = chores[date].length;
            choresIdMap[`${date}_${index}`] = result.id;

            chores[date].push({
                text: text,
                assignedTo: assignedTo,
                completed: false
            });
        }

        // Close modal and refresh calendar
        document.getElementById('choreModal').style.display = 'none';
        renderCalendar();
    } catch (error) {
        console.error('Error adding chore:', error);
        alert('Failed to add chore. Please try again.');
    }
}

// Setup chore value modal handlers
function setupChoreValueModalHandlers() {
    const valueModal = document.getElementById('choreValueModal');
    const valueCloseBtn = document.getElementById('choreValueClose');
    const valueForm = document.getElementById('choreValueForm');
    const addValueBtn = document.getElementById('addChoreValueBtn');

    addValueBtn.addEventListener('click', () => {
        openChoreValueModal();
    });

    valueCloseBtn.onclick = () => {
        valueModal.style.display = 'none';
    };

    valueForm.addEventListener('submit', (e) => {
        e.preventDefault();
        addChoreValue();
    });
}

// Open chore value modal
function openChoreValueModal() {
    const modal = document.getElementById('choreValueModal');

    // Clear edit mode
    delete modal.dataset.editMode;
    delete modal.dataset.editChoreName;

    document.getElementById('valueChoreText').value = '';
    document.getElementById('valueDollarAmount').value = '';
    modal.style.display = 'block';
}

// Edit chore value
function editChoreValue(choreName, currentValue) {
    const modal = document.getElementById('choreValueModal');

    // Store the edit info in the modal
    modal.dataset.editMode = 'true';
    modal.dataset.editChoreName = choreName;

    // Populate form with existing data
    document.getElementById('valueChoreText').value = choreName;
    document.getElementById('valueDollarAmount').value = currentValue.toFixed(2);

    modal.style.display = 'block';
}

// Add chore value
async function addChoreValue() {
    const modal = document.getElementById('choreValueModal');
    const choreName = document.getElementById('valueChoreText').value.trim();
    const dollarValue = parseFloat(document.getElementById('valueDollarAmount').value);

    if (!choreName || isNaN(dollarValue) || dollarValue < 0) {
        alert('Please enter a valid chore name and dollar value.');
        return;
    }

    try {
        // Check if we're in edit mode
        if (modal.dataset.editMode === 'true') {
            const oldChoreName = modal.dataset.editChoreName;
            const dbId = choreValuesIdMap[oldChoreName];

            if (dbId) {
                await apiPut(`chore-values/${dbId}`, {
                    choreName,
                    dollarValue
                });
            }

            // Update in memory
            if (oldChoreName !== choreName) {
                // Name changed - delete old key and add new one
                delete choreValues[oldChoreName];
                delete choreValuesIdMap[oldChoreName];
            }
            choreValues[choreName] = dollarValue;
            choreValuesIdMap[choreName] = dbId;

            // Clear edit mode
            delete modal.dataset.editMode;
            delete modal.dataset.editChoreName;
        } else {
            // Adding new chore value
            const result = await apiPost('chore-values', {
                choreName,
                dollarValue
            });

            choreValues[choreName] = dollarValue;
            choreValuesIdMap[choreName] = result.id;
        }

        document.getElementById('choreValueModal').style.display = 'none';
        renderChoreValueGrid();
    } catch (error) {
        console.error('Error saving chore value:', error);
        alert('Failed to save chore value. Please try again.');
    }
}

// Delete chore value
async function deleteChoreValue(choreName) {
    if (confirm(`Are you sure you want to delete the value for "${choreName}"?`)) {
        try {
            const dbId = choreValuesIdMap[choreName];
            if (dbId) {
                await apiDelete(`chore-values/${dbId}`);
            }

            delete choreValues[choreName];
            delete choreValuesIdMap[choreName];
            renderChoreValueGrid();
        } catch (error) {
            console.error('Error deleting chore value:', error);
            alert('Failed to delete chore value. Please try again.');
        }
    }
}

// Render chore value grid
function renderChoreValueGrid() {
    const grid = document.getElementById('choreValueGrid');
    grid.innerHTML = '';

    const sortedChores = Object.keys(choreValues).sort((a, b) => a.localeCompare(b));

    sortedChores.forEach(choreName => {
        const value = choreValues[choreName];

        const nameDiv = document.createElement('div');
        nameDiv.className = 'chore-name';
        nameDiv.textContent = choreName;

        const valueDiv = document.createElement('div');
        valueDiv.className = 'chore-value';

        const valueSpan = document.createElement('span');
        valueSpan.textContent = `$${value.toFixed(2)}`;

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-value-btn';
        editBtn.textContent = '✎';
        editBtn.title = 'Edit value';
        editBtn.onclick = () => editChoreValue(choreName, value);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-value-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete value';
        deleteBtn.onclick = () => deleteChoreValue(choreName);

        valueDiv.appendChild(valueSpan);
        valueDiv.appendChild(editBtn);
        valueDiv.appendChild(deleteBtn);

        grid.appendChild(nameDiv);
        grid.appendChild(valueDiv);
    });

    if (sortedChores.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.gridColumn = '1 / -1';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = '#999';
        emptyMsg.style.padding = '20px';
        emptyMsg.textContent = 'No chore values yet. Click the button below to add one.';
        grid.appendChild(emptyMsg);
    }
}

// Toggle chore completion
async function toggleChore(date, index) {
    if (chores[date] && chores[date][index]) {
        try {
            const chore = chores[date][index];
            const wasCompleted = chore.completed;
            chore.completed = !chore.completed;

            // Update in database
            const dbId = choresIdMap[`${date}_${index}`];
            if (dbId) {
                await apiPut(`chores/${dbId}`, {
                    completed: chore.completed ? 1 : 0
                });
            }

            // Update monthly completion tracking
            if (chore.assignedTo) {
                const currentMonth = getCurrentMonth();
                if (!monthlyCompletions[currentMonth]) {
                    monthlyCompletions[currentMonth] = {};
                }
                if (!monthlyCompletions[currentMonth][chore.assignedTo]) {
                    monthlyCompletions[currentMonth][chore.assignedTo] = 0;
                }

                // Increment or decrement based on completion status
                if (chore.completed && !wasCompleted) {
                    monthlyCompletions[currentMonth][chore.assignedTo]++;
                } else if (!chore.completed && wasCompleted) {
                    monthlyCompletions[currentMonth][chore.assignedTo]--;
                }

                // Save to database
                await apiPost('completions', {
                    month: currentMonth,
                    familyMember: chore.assignedTo,
                    count: monthlyCompletions[currentMonth][chore.assignedTo]
                });
            }

            renderCalendar();
            renderCompletionChart();
        } catch (error) {
            console.error('Error toggling chore:', error);
            alert('Failed to update chore. Please try again.');
        }
    }
}

// Delete chore
async function deleteChore(date, index) {
    if (chores[date]) {
        try {
            const dbId = choresIdMap[`${date}_${index}`];
            if (dbId) {
                await apiDelete(`chores/${dbId}`);
            }

            chores[date].splice(index, 1);
            if (chores[date].length === 0) {
                delete chores[date];
            }
            renderCalendar();
        } catch (error) {
            console.error('Error deleting chore:', error);
            alert('Failed to delete chore. Please try again.');
        }
    }
}

async function deleteAllRecurringChores(recurId) {
    if (confirm('Are you sure you want to delete ALL occurrences of this recurring chore?')) {
        try {
            // Delete from database (API will delete both recurring template and all instances)
            await apiDelete(`recurring-chores/${recurId}`);

            // Reload all data and regenerate recurring items
            await loadAllData();
            await processRecurringItems();
            renderCalendar();
        } catch (error) {
            console.error('Error deleting recurring chores:', error);
            alert('Failed to delete recurring chores. Please try again.');
        }
    }
}

// Stop future recurring chores (set end date to today or specified date)
async function stopFutureRecurringChores(recurId, fromDate) {
    if (confirm('Are you sure you want to stop all future occurrences of this recurring chore?')) {
        try {
            // Find the recurring chore template
            const recurChore = recurringChores.find(r => r.id === recurId);
            if (!recurChore) {
                alert('Recurring chore template not found.');
                return;
            }

            // Calculate the end date (day before the fromDate)
            const stopDate = new Date(fromDate);
            stopDate.setDate(stopDate.getDate() - 1);
            const endDate = formatDate(stopDate);

            // Update the recurring chore to set end date
            await apiPut(`recurring-chores/${recurId}`, {
                endDate: endDate
            });

            // Delete all future instances (dates after fromDate)
            for (const dateStr in chores) {
                if (dateStr >= fromDate) {
                    const choreList = chores[dateStr];
                    for (let i = choreList.length - 1; i >= 0; i--) {
                        if (choreList[i].recurId === recurId) {
                            const dbId = choresIdMap[`${dateStr}_${i}`];
                            if (dbId) {
                                await apiDelete(`chores/${dbId}`);
                            }
                        }
                    }
                }
            }

            // Reload all data
            await loadAllData();
            await processRecurringItems();
            renderCalendar();
        } catch (error) {
            console.error('Error stopping future recurring chores:', error);
            alert('Failed to stop future occurrences. Please try again.');
        }
    }
}

// Edit chore
function editChore(date, index) {
    if (chores[date] && chores[date][index]) {
        const chore = chores[date][index];
        const modal = document.getElementById('choreModal');

        // Store the edit info in the modal
        modal.dataset.editMode = 'true';
        modal.dataset.editDate = date;
        modal.dataset.editIndex = index;

        // Populate form with existing data
        document.getElementById('choreDate').value = date;
        document.getElementById('choreText').value = chore.text;
        document.getElementById('choreAssignedTo').value = chore.assignedTo || '';

        // Don't show recurring options for editing existing chores
        document.getElementById('choreRecurring').checked = false;
        document.getElementById('choreRecurringOptions').style.display = 'none';

        modal.style.display = 'block';
    }
}

// Check Google Calendar configuration
function checkGcalConfig() {
    const setupBtn = document.getElementById('gcalSetupBtn');
    const syncBtn = document.getElementById('gcalSyncBtn');
    const statusEl = document.getElementById('gcalStatus');

    if (gcalConfig && (gcalConfig.api_key || gcalConfig.apiKey) && (gcalConfig.calendar_id || gcalConfig.calendarId)) {
        setupBtn.textContent = '⚙️ Update Google Calendar';
        syncBtn.style.display = 'inline-block';
        statusEl.textContent = '✓ Connected';
        statusEl.style.color = '#28a745';
        // Auto-sync on load
        syncGoogleCalendar();
    } else {
        syncBtn.style.display = 'none';
        statusEl.textContent = '';
    }
}

// Setup Google Calendar modal handlers
function setupGcalModalHandlers() {
    const gcalModal = document.getElementById('gcalModal');
    const gcalSetupBtn = document.getElementById('gcalSetupBtn');
    const gcalSyncBtn = document.getElementById('gcalSyncBtn');
    const gcalCloseBtn = document.getElementById('gcalClose');
    const gcalForm = document.getElementById('gcalForm');

    gcalSetupBtn.onclick = () => {
        if (gcalConfig) {
            document.getElementById('gcalApiKey').value = gcalConfig.api_key || gcalConfig.apiKey || '';
            document.getElementById('gcalCalendarId').value = gcalConfig.calendar_id || gcalConfig.calendarId || '';
        }
        gcalModal.style.display = 'block';
    };

    gcalSyncBtn.onclick = () => {
        syncGoogleCalendar();
    };

    gcalCloseBtn.onclick = () => {
        gcalModal.style.display = 'none';
    };

    gcalForm.onsubmit = async (e) => {
        e.preventDefault();
        const apiKey = document.getElementById('gcalApiKey').value.trim();
        const calendarId = document.getElementById('gcalCalendarId').value.trim();

        if (apiKey && calendarId) {
            try {
                await apiPost('gcal-config', {
                    apiKey: apiKey,
                    calendarId: calendarId
                });

                gcalConfig = { api_key: apiKey, calendar_id: calendarId };
                gcalModal.style.display = 'none';
                checkGcalConfig();
                syncGoogleCalendar();
            } catch (error) {
                console.error('Error saving Google Calendar config:', error);
                alert('Failed to save configuration. Please try again.');
            }
        } else {
            alert('Please fill in both API Key and Calendar ID');
        }
    };
}

// Sync Google Calendar events
async function syncGoogleCalendar() {
    const apiKey = gcalConfig?.api_key || gcalConfig?.apiKey;
    const calendarId = gcalConfig?.calendar_id || gcalConfig?.calendarId;

    if (!gcalConfig || !apiKey || !calendarId) {
        return;
    }

    const statusEl = document.getElementById('gcalStatus');
    statusEl.textContent = '🔄 Syncing...';
    statusEl.style.color = '#667eea';

    try {
        // Get start and end of current week
        const weekStart = new Date(currentWeekStart);
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const timeMin = weekStart.toISOString();
        const timeMax = weekEnd.toISOString();

        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || 'Failed to fetch calendar events');
        }

        // Clear existing Google Calendar events
        gcalEvents = {};

        // Process events
        if (data.items) {
            data.items.forEach(event => {
                const startDate = event.start.dateTime || event.start.date;
                const dateStr = formatDate(new Date(startDate));

                if (!gcalEvents[dateStr]) {
                    gcalEvents[dateStr] = [];
                }

                gcalEvents[dateStr].push({
                    title: event.summary || 'Untitled Event',
                    time: event.start.dateTime ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'All Day',
                    description: event.description || '',
                    source: 'google'
                });
            });
        }

        statusEl.textContent = `✓ Synced (${data.items ? data.items.length : 0} events)`;
        statusEl.style.color = '#28a745';

        // Re-render calendar with Google events
        renderCalendar();

    } catch (error) {
        console.error('Error syncing Google Calendar:', error);
        statusEl.textContent = '✗ Sync failed';
        statusEl.style.color = '#dc3545';
        alert('Failed to sync Google Calendar: ' + error.message + '\n\nMake sure your API key is valid and the Calendar API is enabled.');
    }
}

// Calculate earnings for a family member in a given month
function calculateEarnings(familyMember, month) {
    let totalEarnings = 0;

    // Go through all chores in the database for this month
    for (const dateStr in chores) {
        // Check if this date is in the current month
        if (dateStr.startsWith(month)) {
            const dailyChores = chores[dateStr];
            dailyChores.forEach(chore => {
                if (chore.assignedTo === familyMember && chore.completed) {
                    // Find matching chore value
                    const choreValue = choreValues[chore.text] || 0;
                    totalEarnings += choreValue;
                }
            });
        }
    }

    return totalEarnings;
}

// Render completion chart
function renderCompletionChart() {
    const chartContainer = document.getElementById('completionChart');
    const currentMonth = getCurrentMonth();
    const currentMonthData = monthlyCompletions[currentMonth] || {};

    // Family members in order
    const familyMembers = [
        { key: 'dad', name: 'Dad', color: familyColors.dad },
        { key: 'mom', name: 'Mom', color: familyColors.mom },
        { key: 'karma', name: 'Karma', color: familyColors.karma },
        { key: 'ben', name: 'Ben', color: familyColors.ben },
        { key: 'jasmine', name: 'Jasmine', color: familyColors.jasmine }
    ];

    // Get max value for scaling
    const maxCompletions = Math.max(...familyMembers.map(fm => currentMonthData[fm.key] || 0), 10);

    chartContainer.innerHTML = familyMembers.map(member => {
        const count = currentMonthData[member.key] || 0;
        const earnings = calculateEarnings(member.key, currentMonth);
        const percentage = maxCompletions > 0 ? (count / maxCompletions) * 100 : 0;

        return `
            <div class="chart-row">
                <div class="chart-label" style="color: ${member.color};">${member.name}</div>
                <div class="chart-bar-container">
                    <div class="chart-bar" style="width: ${percentage}%; background-color: ${member.color};"></div>
                </div>
                <div class="chart-value">${count} chores • $${earnings.toFixed(2)}</div>
            </div>
        `;
    }).join('');
}
