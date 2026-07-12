const API_URL = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';
const MAX_TRAINS = 2;
const REFRESH_INTERVAL = 30000;

const STATION_NAMES = {
    WKS: 'Wu Kai Sha', TUM: 'Tuen Mun', HOK: 'Hong Kong',
    KOW: 'Kowloon', TSY: 'Tsing Yi', AIR: 'Airport',
    OLY: 'Olympic', NAC: 'Nam Cheong', LAK: 'Lai King',
    SUN: 'Sunny Bay', TUC: 'Tung Chung', AUS: 'Austin',
    HUH: 'Hung Hom', DIH: 'Diamond Hill', HOM: 'Ho Man Tin'
};

const DIRECTION_LABELS = {
    TML: { up: 'Tuen Mun', down: 'Wu Kai Sha' },
    TCL: { up: 'Tung Chung', down: 'Hong Kong' }
};

const CONFIGS = {
    all: [
        { line: 'TML', code: 'AUS', name: 'Austin', directions: ['up', 'down'] },
        { line: 'TCL', code: 'NAC', name: 'Nam Cheong', directions: ['up', 'down'] }
    ],
    work: [
        { line: 'TML', code: 'AUS', name: 'Austin', directions: ['up'] },
        { line: 'TCL', code: 'NAC', name: 'Nam Cheong', directions: ['down'] }
    ]
};

let currentConfig = 'work';
let isRefreshing = false;

function init() {
    renderConfig();
    updateTime();
    setInterval(updateTime, 1000);
    fetchAll();

    document.getElementById('configSelect').addEventListener('change', (e) => {
        currentConfig = e.target.value;
        renderConfig();
        fetchAll();
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        if (!isRefreshing) fetchAll();
    });

    setInterval(fetchAll, REFRESH_INTERVAL);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

function renderConfig() {
    const container = document.getElementById('stationContainer');
    const stations = CONFIGS[currentConfig];

    container.innerHTML = stations.map((s, i) => {
        const lineClass = s.line.toLowerCase();
        const dirHtml = s.directions.map(dir => {
            const label = DIRECTION_LABELS[s.line]?.[dir] || dir;
            return `
                <section class="direction">
                    <div class="direction-header">
                        <span class="direction-label">→ ${label}</span>
                        <span class="platform-badge" id="${lineClass}${dir}Platform">-</span>
                    </div>
                    <div class="train-list" id="${lineClass}${dir}Trains">
                        <div class="train-row loading"><span>Loading...</span></div>
                    </div>
                </section>`;
        }).join('');

        return `
            <div class="station-card" id="${lineClass}Card">
                <div class="station-card-header">
                    <div class="line-badge ${lineClass}">${s.line}</div>
                    <h1 class="station-name">${s.name}</h1>
                    <span class="station-code">${s.code}</span>
                </div>
                <div class="status-bar">
                    <span class="status-dot" id="${lineClass}Dot"></span>
                </div>
            </div>
            <div class="directions" id="${lineClass}Directions">${dirHtml}</div>
            ${i < stations.length - 1 ? '<div class="divider"></div>' : ''}
        `;
    }).join('');
}

function updateTime() {
    const now = new Date().toLocaleTimeString('en-HK', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const el = document.getElementById('topTime');
    if (el) el.textContent = now;
}

async function fetchAll() {
    if (isRefreshing) return;
    isRefreshing = true;

    document.getElementById('refreshBtn').classList.add('spinning');

    try {
        await Promise.all(CONFIGS[currentConfig].map(s => fetchStation(s)));
    } catch (e) {
        console.error(e);
    } finally {
        isRefreshing = false;
        document.getElementById('refreshBtn').classList.remove('spinning');
    }
}

async function fetchStation(station) {
    const { line, code, directions } = station;
    const prefix = line.toLowerCase();
    const stationKey = `${line}-${code}`;

    try {
        const res = await fetch(`${API_URL}?line=${line}&sta=${code}&lang=EN`);
        const data = await res.json();

        const dot = document.getElementById(`${prefix}Dot`);
        dot.classList.remove('error');

        if (data.status === 0) {
            directions.forEach(dir => showSpecial(`${prefix}${dir}`, data.message));
            return;
        }

        if (data.isdelay === 'Y') {
            dot.classList.add('error');
        }

        const stationData = data.data?.[stationKey];
        if (!stationData) {
            directions.forEach(dir => showNoData(`${prefix}${dir}`));
            return;
        }

        directions.forEach(dir => {
            const trains = dir === 'up' ? stationData.UP : stationData.DOWN;
            renderTrains(`${prefix}${dir}`, trains);
        });

        document.getElementById('lastUpdate').textContent = `Updated ${formatTime(data.curr_time)}`;

    } catch (error) {
        console.error(`Fetch error for ${code}:`, error);
        document.getElementById(`${prefix}Dot`).classList.add('error');
        directions.forEach(dir => showError(`${prefix}${dir}`));
    }
}

function renderTrains(id, trains) {
    const container = document.getElementById(`${id}Trains`);
    const platformEl = document.getElementById(`${id}Platform`);

    if (!trains || trains.length === 0) {
        container.innerHTML = '<div class="train-row no-data"><span>No upcoming trains</span></div>';
        platformEl.textContent = '-';
        return;
    }

    platformEl.textContent = `Plat ${trains[0].plat}`;
    const display = trains.slice(0, MAX_TRAINS);

    container.innerHTML = display.map((train, i) => {
        const destName = STATION_NAMES[train.dest] || train.dest;
        const etaSeconds = parseTimeDiff(train.time);
        const countdown = Math.max(0, Math.round(etaSeconds / 60));
        const isArriving = countdown <= 1;

        let cls = 'green';
        if (countdown <= 4) cls = 'red';
        else if (countdown === 5) cls = 'orange';

        if (isArriving) cls = 'arriving';

        return `
            <div class="train-row" style="animation-delay:${i * 50}ms">
                <div class="eta-countdown ${cls}">${isArriving ? '<1' : countdown}</div>
                <div class="train-details">
                    <div class="train-dest">${destName}</div>
                    <div class="train-time">${formatTrainTime(train.time)}</div>
                </div>
                <div class="train-min">${isArriving ? 'min' : countdown + ' min'}</div>
            </div>`;
    }).join('');
}

function parseTimeDiff(timeStr) {
    const target = new Date(timeStr.replace(' ', 'T') + '+08:00');
    return (target - new Date()) / 1000;
}

function formatTrainTime(timeStr) {
    if (!timeStr || timeStr === '-') return '--:--';
    const date = new Date(timeStr.replace(' ', 'T') + '+08:00');
    return date.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatTime(timeStr) {
    if (!timeStr || timeStr === '-') return '';
    const date = new Date(timeStr.replace(' ', 'T') + '+08:00');
    return date.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function showSpecial(id, message) {
    const el = document.getElementById(`${id}Trains`);
    if (el) el.innerHTML = `<div class="train-row no-data"><span>${message || 'Special service arrangement'}</span></div>`;
}

function showNoData(id) {
    const el = document.getElementById(`${id}Trains`);
    if (el) el.innerHTML = '<div class="train-row no-data"><span>No schedule data</span></div>';
}

function showError(id) {
    const el = document.getElementById(`${id}Trains`);
    if (el) el.innerHTML = '<div class="train-row no-data"><span>Connection error</span></div>';
}

init();
