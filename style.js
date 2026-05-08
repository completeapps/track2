const {
  auth, db, ref, onValue, set,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} = window.firebaseStuff;

// DOM refs
const authScreen    = document.getElementById('authScreen');
const appScreen     = document.getElementById('appScreen');
const authEmail     = document.getElementById('authEmail');
const authPassword  = document.getElementById('authPassword');
const authError     = document.getElementById('authError');
const userEmailEl   = document.getElementById('userEmail');
const syncStatus    = document.getElementById('syncStatus');
const btnSignUp     = document.getElementById('btnSignUp');
const btnSignIn     = document.getElementById('btnSignIn');
const btnLogout     = document.getElementById('btnLogout');

const entryForm     = document.getElementById('entryForm');
const dateInput     = document.getElementById('date');
const eventInput    = document.getElementById('event');
const valueInput    = document.getElementById('value');
const notesInput    = document.getElementById('notes');
const entriesList   = document.getElementById('entriesList');
const statsContent  = document.getElementById('statsContent');

let entries = [];
let entriesRef = null;
let chart = null;

dateInput.value = new Date().toISOString().split('T')[0];

function setSync(text, color) {
  syncStatus.textContent = text;
  syncStatus.style.background = color;
}

// Auth handlers
btnSignUp.addEventListener('click', async () => {
  authError.textContent = '';
  try {
    await createUserWithEmailAndPassword(auth, authEmail.value, authPassword.value);
  } catch (err) {
    authError.textContent = err.message;
  }
});

btnSignIn.addEventListener('click', async () => {
  authError.textContent = '';
  try {
    await signInWithEmailAndPassword(auth, authEmail.value, authPassword.value);
  } catch (err) {
    authError.textContent = err.message;
  }
});

btnLogout.addEventListener('click', async () => {
  await signOut(auth);
});

// Auth state
onAuthStateChanged(auth, (user) => {
  if (user) {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    userEmailEl.textContent = user.email || '(no email)';
    setSync('Syncing…', '#facc15');

    entriesRef = ref(db, `users/${user.uid}/entries`);
    onValue(entriesRef, (snapshot) => {
      const data = snapshot.val();
      entries = data ? Object.values(data) : [];
      setSync('Synced', '#22c55e');
      renderEntries();
    });
  } else {
    appScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
  }
});

// Form submit
entryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!entriesRef) return;

  const entry = {
    date: dateInput.value,
    event: eventInput.value,
    value: valueInput.value.trim(),
    notes: notesInput.value.trim()
  };
  if (!entry.date || !entry.event || !entry.value) return;

  entries.unshift(entry);
  saveEntries();
  dateInput.value = new Date().toISOString().split('T')[0];
  eventInput.value = '';
  valueInput.value = '';
  notesInput.value = '';
});

function saveEntries() {
  if (!entriesRef) return;
  const obj = {};
  entries.forEach((e, i) => { obj[i] = e; });
  set(entriesRef, obj);
  setSync('Saving…', '#f97316');
}

// Helpers
function numeric(val) {
  const n = parseFloat(String(val).replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}

function isBetter(newVal, oldVal, event) {
  const nNew = numeric(newVal);
  const nOld = numeric(oldVal);
  if (nNew === null || nOld === null) return false;
  if (event === 'Long Jump') return nNew > nOld;
  return nNew < nOld;
}

// Stats
function renderStats() {
  if (!entries.length) {
    statsContent.textContent = 'No entries yet. Log something to see your PRs.';
    return;
  }
  const pb = {};
  entries.forEach(e => {
    if (!pb[e.event] || isBetter(e.value, pb[e.event].value, e.event)) {
      pb[e.event] = e;
    }
  });
  const lines = [];
  for (const ev in pb) {
    lines.push(`${ev}: ${pb[ev].value} on ${pb[ev].date}`);
  }
  statsContent.textContent = lines.join(' | ');
}

// Chart
function renderChart() {
  const ctx = document.getElementById('progressChart').getContext('2d');
  if (chart) chart.destroy();

  const eventData = {};
  entries.forEach(e => {
    if (!eventData[e.event]) eventData[e.event] = [];
    const val = numeric(e.value);
    if (val !== null) {
      eventData[e.event].push({ date: new Date(e.date), value: val });
    }
  });

  if (!Object.keys(eventData).length) {
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: { plugins: { title: { display: true, text: 'Log entries to see your progress' } } }
    });
    return;
  }

  const datasets = Object.keys(eventData).map(ev => {
    const sorted = eventData[ev].sort((a,b)=> a.date - b.date);
    return {
      label: ev,
      data: sorted.map(p => p.value),
      borderColor: ev === '100m' ? '#ef4444' : ev === '200m' ? '#3b82f6' : '#10b981',
      backgroundColor: 'rgba(0,0,0,0.05)',
      fill: true,
      tension: 0.35,
      pointRadius: 4
    };
  });
  const labels = datasets[0].data.map((_, i) => `Session ${i+1}`);
  const needsReverse = datasets.some(ds => ds.label !== 'Long Jump');

  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          reverse: needsReverse,
          title: { display: true, text: 'Performance (↓ better for sprints, ↑ for jumps)' }
        },
        x: { title: { display: true, text: 'Sessions' } }
      },
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: 'Progress over time' }
      },
      interaction: { mode: 'index', intersect: false }
    }
  });
}

// Entries
function renderEntries() {
  entriesList.innerHTML = '';
  entries.forEach((e, i) => {
    const li = document.createElement('li');
    li.className = 'entry-item';
    li.innerHTML = `
      <div class="entry-main">
        <div class="entry-heading">${e.date} • ${e.event}</div>
        <div class="entry-value">${e.value}</div>
        <div class="entry-notes">${e.notes || ''}</div>
      </div>
      <button class="btn btn-danger btn-small">Delete</button>
    `;
    li.querySelector('button').addEventListener('click', () => {
      entries.splice(i, 1);
      saveEntries();
      renderEntries();
    });
    entriesList.appendChild(li);
  });
  renderStats();
  renderChart();
}
