const API_URL = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';
const MAX_TRAINS = 2;
const REFRESH_INTERVAL = 30000;

const STATIONS = [
    { line: 'TML', code: 'AUS', name: 'Austin', prefix: 'tml' },
    { line: 'TCL', code: 'NAC', name: 'Nam Cheong', prefix: 'tcl' }
];

const STATION_NAMES = {
    WKS: 'Wu Kai Sha', MOS: 'Ma On Shan', HEO: 'Heng On',
    TSH: 'Tai Shui Hang', SHM: 'Shek Mun', CIO: 'City One',
    STW: 'Sha Tin Wai', CKT: 'Che Kung Temple', TAW: 'Tai Wai',
    HIK: 'Hin Keng', DIH: 'Diamond Hill', KAT: 'Kai Tak',
    SUW: 'Sung Wong Toi', TKW: 'To Kwa Wan', HOM: 'Ho Man Tin',
    HUH: 'Hung Hom', ETS: 'East Tsim Sha Tsui', AUS: 'Austin',
    NAC: 'Nam Cheong', MEF: 'Mei Foo', TWW: 'Tsuen Wan West',
    KSR: 'Kam Sheung Road', YUL: 'Yuen Long', LOP: 'Long Ping',
    TIS: 'Tin Shui Wai', SIH: 'Siu Hong', TUM: 'Tuen Mun',
    HOK: 'Hong Kong', KOW: 'Kowloon', TSY: 'Tsing Yi',
    AIR: 'Airport', AWE: 'AsiaWorld Expo', OLY: 'Olympic',
    LAK: 'Lai King', SUN: 'Sunny Bay', TUC: 'Tung Chung'
};

let isRefreshing = false;

function init() {
    updateTime();
    setInterval(updateTime, 1000);
    fetchAll();

    document.getElementById('refreshBtn').addEventListener('click', () => {
        if (!isRefreshing) fetchAll();
    });

    setInterval(fetchAll, REFRESH_INTERVAL);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

function updateTime() {
    const now = new Date().toLocaleTimeString('en-HK', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    document.getElementById('tmlTime').textContent = now;
    document.getElementById('tclTime').textContent = now;
}

async function fetchAll() {
    if (isRefreshing) return;
    isRefreshing = true;

    document.getElementById('refreshBtn').classList.add('spinning');

    try {
        await Promise.all(STATIONS.map(s => fetchStation(s)));
    } catch (e) {
        console.error(e);
    } finally {
        isRefreshing = false;
        document.getElementById('refreshBtn').classList.remove('spinning');
    }
}

async function fetchStation(station) {
    const { line, code, prefix } = station;
    const stationKey = `${line}-${code}`;

    try {
        const res = await fetch(`${API_URL}?line=${line}&sta=${code}&lang=EN`);
        const data = await res.json();

        const dot = document.getElementById(`${prefix}Dot`);
        dot.classList.remove('error');

        if (data.status === 0) {
            showSpecialService(prefix, data.message || data.url);
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

        renderTrains(prefix, 'Up', stationData.UP);
        renderTrains(prefix, 'Down', stationData.DOWN);
        document.getElementById('lastUpdate').textContent = `Updated ${formatTime(data.curr_time)}`;

    } catch (error) {
        console.error(`Fetch error for ${code}:`, error);
        document.getElementById(`${prefix}Dot`).classList.add('error');
        showError(prefix);
    }
}

function renderTrains(prefix, direction, trains) {
    const container = document.getElementById(`${prefix}${direction}Trains`);
    const platformEl = document.getElementById(`${prefix}${direction}Platform`);

    if (!trains || trains.length === 0) {
        container.innerHTML = '<div class="train-row no-data"><span>No upcoming trains</span></div>';
        platformEl.textContent = '-';
        return;
    }

    platformEl.textContent = `Plat ${trains[0].plat}`;

    const displayTrains = trains.slice(0, MAX_TRAINS);

    container.innerHTML = displayTrains.map((train, i) => {
        const destName = STATION_NAMES[train.dest] || train.dest;
        const etaSeconds = parseTimeDiff(train.time);
        const countdown = Math.max(0, Math.round(etaSeconds / 60));
        const isArriving = countdown <= 1;
        const isSoon = countdown <= 3;

        let countdownClass = 'normal';
        if (isArriving) countdownClass = 'arriving';
        else if (isSoon) countdownClass = 'soon';

        return `
            <div class="train-row" style="animation-delay: ${i * 50}ms">
                <div class="eta-countdown ${countdownClass}">${isArriving ? '<1' : countdown}</div>
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

function showSpecialService(prefix, message) {
    document.getElementById(`${prefix}UpTrains`).innerHTML =
        `<div class="train-row no-data"><span>${message || 'Special service arrangement'}</span></div>`;
    document.getElementById(`${prefix}DownTrains`).innerHTML = '';
}

function showNoData(prefix) {
    const html = '<div class="train-row no-data"><span>No schedule data available</span></div>';
    document.getElementById(`${prefix}UpTrains`).innerHTML = html;
    document.getElementById(`${prefix}DownTrains`).innerHTML = html;
}

function showError(prefix) {
    const html = '<div class="train-row no-data"><span>Connection error. Tap to retry.</span></div>';
    document.getElementById(`${prefix}UpTrains`).innerHTML = html;
    document.getElementById(`${prefix}DownTrains`).innerHTML = html;
}

init();
