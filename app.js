const API_URL = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';
const LINE = 'TML';
const STATION = 'AUS';
const STATION_KEY = `${LINE}-${STATION}`;
const REFRESH_INTERVAL = 30000; // 30 seconds

// Station name mappings for display
const STATION_NAMES = {
    WKS: 'Wu Kai Sha', MOS: 'Ma On Shan', HEO: 'Heng On',
    TSH: 'Tai Shui Hang', SHM: 'Shek Mun', CIO: 'City One',
    STW: 'Sha Tin Wai', CKT: 'Che Kung Temple', TAW: 'Tai Wai',
    HIK: 'Hin Keng', DIH: 'Diamond Hill', KAT: 'Kai Tak',
    SUW: 'Sung Wong Toi', TKW: 'To Kwa Wan', HOM: 'Ho Man Tin',
    HUH: 'Hung Hom', ETS: 'East Tsim Sha Tsui', AUS: 'Austin',
    NAC: 'Nam Cheong', MEF: 'Mei Foo', TWW: 'Tsuen Wan West',
    KSR: 'Kam Sheung Road', YUL: 'Yuen Long', LOP: 'Long Ping',
    TIS: 'Tin Shui Wai', SIH: 'Siu Hong', TUM: 'Tuen Mun'
};

// DOM Elements
const elements = {
    currentTime: document.getElementById('currentTime'),
    statusDot: document.getElementById('statusDot'),
    delayBanner: document.getElementById('delayBanner'),
    delayMessage: document.getElementById('delayMessage'),
    upTrains: document.getElementById('upTrains'),
    downTrains: document.getElementById('downTrains'),
    upPlatform: document.getElementById('upPlatform'),
    downPlatform: document.getElementById('downPlatform'),
    refreshBtn: document.getElementById('refreshBtn'),
    lastUpdate: document.getElementById('lastUpdate')
};

let refreshTimer = null;
let isRefreshing = false;

// Initialize the app
function init() {
    updateTime();
    setInterval(updateTime, 1000);
    fetchETA();

    elements.refreshBtn.addEventListener('click', () => {
        if (!isRefreshing) fetchETA();
    });

    // Auto-refresh
    refreshTimer = setInterval(fetchETA, REFRESH_INTERVAL);

    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

function updateTime() {
    const now = new Date();
    elements.currentTime.textContent = now.toLocaleTimeString('en-HK', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

async function fetchETA() {
    if (isRefreshing) return;
    isRefreshing = true;

    elements.refreshBtn.classList.add('spinning');
    elements.statusDot.classList.remove('error');

    try {
        const response = await fetch(`${API_URL}?line=${LINE}&sta=${STATION}&lang=EN`);
        const data = await response.json();

        if (data.status === 0) {
            showSpecialService(data.message || data.url);
            return;
        }

        if (data.isdelay === 'Y') {
            showDelay();
        } else {
            hideDelay();
        }

        const stationData = data.data?.[STATION_KEY];

        if (!stationData) {
            showNoData();
            return;
        }

        renderTrains('up', stationData.UP);
        renderTrains('down', stationData.DOWN);

        elements.lastUpdate.textContent = `Updated ${formatTime(data.curr_time)}`;

    } catch (error) {
        console.error('Fetch error:', error);
        elements.statusDot.classList.add('error');
        showError();
    } finally {
        isRefreshing = false;
        elements.refreshBtn.classList.remove('spinning');
    }
}

function renderTrains(direction, trains) {
    const container = direction === 'up' ? elements.upTrains : elements.downTrains;
    const platformEl = direction === 'up' ? elements.upPlatform : elements.downPlatform;

    if (!trains || trains.length === 0) {
        container.innerHTML = `
            <div class="train-row no-data">
                <span>No upcoming trains</span>
            </div>`;
        platformEl.textContent = '-';
        return;
    }

    // Use first train's platform as reference
    platformEl.textContent = `Plat ${trains[0].plat}`;

    container.innerHTML = trains.map((train, i) => {
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
                <div class="eta-countdown ${countdownClass}">
                    ${isArriving ? '<1' : countdown}
                </div>
                <div class="train-details">
                    <div class="train-dest">${destName}</div>
                    <div class="train-time">${formatTrainTime(train.time)}</div>
                </div>
                <div class="train-min">${isArriving ? 'min' : `${countdown} min`}</div>
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
    return date.toLocaleTimeString('en-HK', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function formatTime(timeStr) {
    if (!timeStr || timeStr === '-') return '';
    const date = new Date(timeStr.replace(' ', 'T') + '+08:00');
    return date.toLocaleTimeString('en-HK', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function showDelay() {
    elements.delayBanner.classList.remove('hidden');
    elements.delayMessage.textContent = 'Service may be delayed';
}

function hideDelay() {
    elements.delayBanner.classList.add('hidden');
}

function showSpecialService(message) {
    elements.upTrains.innerHTML = `
        <div class="train-row no-data">
            <span>⚠️ ${message || 'Special service arrangement'}</span>
        </div>`;
    elements.downTrains.innerHTML = '';
}

function showNoData() {
    const noDataHtml = `
        <div class="train-row no-data">
            <span>No schedule data available</span>
        </div>`;
    elements.upTrains.innerHTML = noDataHtml;
    elements.downTrains.innerHTML = noDataHtml;
}

function showError() {
    const errorHtml = `
        <div class="train-row no-data">
            <span>Connection error. Tap to retry.</span>
        </div>`;
    elements.upTrains.innerHTML = errorHtml;
    elements.downTrains.innerHTML = errorHtml;
}

// Start the app
init();
