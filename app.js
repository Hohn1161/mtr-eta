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

const CONFIGS = {
    all: [
        { line: 'TML', code: 'AUS', name: 'Austin', label: 'Tuen Mun', platform: 'up' },
        { line: 'TCL', code: 'NAC', name: 'Nam Cheong', label: 'Hong Kong', platform: 'down' }
    ],
    work: [
        { line: 'TML', code: 'AUS', name: 'Austin', label: 'Tuen Mun', platform: 'up' },
        { line: 'TCL', code: 'NAC', name: 'Nam Cheong', label: 'Hong Kong', platform: 'down' }
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
        return `
            <div class="station-card" id="${lineClass}Card">
                <div class="station-card-header">
                    <div class="line-badge ${lineClass}">${s.line}</div>
                    <h1 class="station-name">${s.name}</h1>
                    <span class="station-code">${s.code}</span>
                </div>
                <div class="status-bar">
                    <span class="current-time" id="${lineClass}Time"></span>
                    <span class="status-dot" id="${lineClass}Dot"></span>
                </div>
            </div>
            <div class="directions" id="${lineClass}Directions">
                <section class="direction" id="${lineClass}Dir">
                    <div class="direction-header">
                        <span class="direction-label">→ ${s.label}</span>
                        <span class="platform-badge" id="${lineClass}Platform">-</span>
                    </div>
                    <div class="train-list" id="${lineClass}Trains">
                        <div class="train-row loading"><span>Loading...</span></div>
                    </div>
                </section>
            </div>
            ${i < stations.length - 1 ? '<div class="divider"></div>' : ''}
        `;
    }).join('');

    updateTime();
}

function updateTime() {
    const now = new Date().toLocaleTimeString('en-HK', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const stations = CONFIGS[currentConfig];
    stations.forEach(s => {
        const el = document.getElementById(`${s.line.toLowerCase()}Time`);
        if (el) el.textContent = now;
    });
}

async function fetchAll() {
    if (isRefreshing) return;
    isRefreshing = true;

    document.getElementById('refreshBtn').classList.add('spinning');

    try {
        const stations = CONFIGS[currentConfig];
        await Promise.all(stations.map(s => fetchStation(s)));
    } catch (e) {
        console.error(e);
    } finally {
        isRefreshing = false;
        document.getElementById('refreshBtn').classList.remove('spinning');
    }
}

async function fetchStation(station) {
    const { line, code, platform } = station;
    const prefix = line.toLowerCase();
    const stationKey = `${line}-${code}`;

    try {
        const res = await fetch(`${API_URL}?line=${line}&sta=${code}&lang=EN`);
        const data = await res.json();

        const dot = document.getElementById(`${prefix}Dot`);
        dot.classList.remove('error');

        if (data.status === 0) {
            showSpecial(prefix, data.message);
            return;
        }

        if (data.isdelay === 'Y') {
            dot.classList.add('error');
        }

        const stationData = data.data?.[stationKey];
        if (!stationData) {
            showNoData(prefix);
            return;
        }

        const trains = platform === 'up' ? stationData.UP : stationData.DOWN;
        renderTrains(prefix, trains);
        document.getElementById('lastUpdate').textContent = `Updated ${formatTime(data.curr_time)}`;

    } catch (error) {
        console.error(`Fetch error for ${code}:`, error);
        document.getElementById(`${prefix}Dot`).classList.add('error');
        showError(prefix);
    }
}

function renderTrains(prefix, trains) {
    const container = document.getElementById(`${prefix}Trains`);
    const platformEl = document.getElementById(`${prefix}Platform`);

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
        const isSoon = countdown <= 3;

        let cls = 'normal';
        if (isArriving) cls = 'arriving';
        else if (isSoon) cls = 'soon';

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

function showSpecial(prefix, message) {
    const el = document.getElementById(`${prefix}Trains`);
    if (el) el.innerHTML = `<div class="train-row no-data"><span>${message || 'Special service arrangement'}</span></div>`;
}

function showNoData(prefix) {
    const html = '<div class="train-row no-data"><span>No schedule data</span></div>';
    const el = document.getElementById(`${prefix}Trains`);
    if (el) el.innerHTML = html;
}

function showError(prefix) {
    const html = '<div class="train-row no-data"><span>Connection error</span></div>';
    const el = document.getElementById(`${prefix}Trains`);
    if (el) el.innerHTML = html;
}

init();
