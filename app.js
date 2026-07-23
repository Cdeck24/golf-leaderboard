const config = {
    usersDataUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRNfMOTfQ4xpIILu_IPjjOAZjUq2Tfp1UqEMOVnR2Qyz-H572bmiIWbC-GuUlEW7ogM8TUNLFWw5xz3/pub?gid=0&single=true&output=csv',
    scheduleUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTuVpFht1S7pkLdCssZyFR6B3T0f92_cPk_qFMf2KZVm_KTPtKuKvC-2yUfF4oEFpDGIajryZpb3_oV/pub?gid=0&single=true&output=csv',
    archiveDataUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTuVpFht1S7pkLdCssZyFR6B3T0f92_cPk_qFMf2KZVm_KTPtKuKvC-2yUfF4oEFpDGIajryZpb3_oV/pub?gid=949172401&single=true&output=csv',
    dailyDataUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTuVpFht1S7pkLdCssZyFR6B3T0f92_cPk_qFMf2KZVm_KTPtKuKvC-2yUfF4oEFpDGIajryZpb3_oV/pub?gid=435355414&single=true&output=csv',
    workerProxy: 'https://golf-worker.coledecker04.workers.dev/',
    REAL_AUTH_TOKEN: 'xnr5VpW3!ApZk8L2E!4fe6e26f-949f-4936-ae3e-16384878932f',
    REAL_VERSION: '31' 
};

const DEVICE_UUID = crypto.randomUUID();
const REFERENCE_IDS = ['jvbb41pv', 'gv8D5Q0v', '9JmXRKDn', 'WJqVodLv', 'PJPWjGpn', 'Y3Kq1G8J', 'lnEw4avw', '7Jkwd1PJ', 'Gv1DK9aJ', 'xnrGDpRJ'].map(id => id.toLowerCase().trim());

let users = [];
let historicalDailyDataByDate = {}; 
let masterArchiveData = [];
let currentProcessedUsers = [];
let activeTournamentStartDate = null;
let globalCutScoreFri = 99;
let currentGameId = null; 
let globalPlayers = {}; 
let rawProLeaderboardData = null; 
let globalSeasonRanks = {}; 
let globalSeasonStatsArray = []; 
let processedTournamentsCache = null; 
let globalTournamentTiers = {}; 
let globalTournamentTypes = {}; 
let globalTournamentCutRules = {}; 
let activeTournamentKey = null; 

// --- THEME TOGGLE LOGIC ---
function toggleTheme() {
    const isLight = document.documentElement.classList.toggle('light-mode');
    localStorage.setItem('golfplug_theme', isLight ? 'light' : 'dark');
}

// --- TIME TRAVEL ENGINE ---
function getNow() {
    const urlParams = new URLSearchParams(window.location.search);
    const override = urlParams.get('date');
    if (override) {
        const d = new Date(override);
        d.setHours(20); 
        return d;
    }
    const etString = new Date().toLocaleString("en-US", {timeZone: "America/New_York"});
    const now = new Date(etString);
    now.setHours(now.getHours() - 3);
    return now;
}

function switchView(v) {
    document.querySelectorAll('.content-view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${v}`).classList.add('active');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${v}`).classList.add('active');
    
    const banner = document.getElementById('tournament-banner');
    if ((v === 'live' || v === 'upcoming' || v === 'pro') && activeTournamentStartDate) {
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }

    if (v === 'past') closeArchive();
    if (v === 'rankings') renderRankings();
}

function closeArchive() {
    document.getElementById('archive-viewer').style.display = 'none';
    document.getElementById('past-tournament-grid').style.display = 'grid';
}

function formatToPar(score) {
    const n = parseInt(score);
    if (isNaN(n) || n === 0) return '<div class="score-box even">E</div>';
    const formatted = n > 0 ? `+${n}` : n;
    const cls = n < 0 ? 'under' : 'over';
    return `<div class="score-box ${cls}">${formatted}</div>`;
}

let isAdminAuthenticated = false;

function attemptAdminAccess() {
    if (isAdminAuthenticated) {
        toggleExportMenu();
    } else {
        document.getElementById('admin-auth-modal').style.display = 'flex';
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-auth-error').style.display = 'none';
        setTimeout(() => document.getElementById('admin-password').focus(), 100);
    }
}

function closeAdminAuth() {
    document.getElementById('admin-auth-modal').style.display = 'none';
}

function verifyAdminAuth() {
    const pwd = document.getElementById('admin-password').value;
    if (pwd === 'golf-2026') {
        isAdminAuthenticated = true;
        closeAdminAuth();
        toggleExportMenu();
    } else {
        document.getElementById('admin-auth-error').style.display = 'inline-block';
    }
}

function toggleExportMenu() {
    const menu = document.getElementById('export-menu');
    menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
}

function calculateGolfScore(val, pool) {
    if (isNaN(val) || pool.length < 2) return 0;
    const sorted = [...pool].sort((a,b) => a - b);
    const idx = sorted.indexOf(val);
    if (idx === -1) return 0;
    const pr = idx / (sorted.length - 1);
    const z = (pr * 2) - 1; 
    return Math.round(z > 0 ? (-6 * Math.pow(z, 3)) : (-5 * Math.pow(z, 3)));
}

function formatHandle(u) { if(!u) return ''; let c = u.trim(); while(c.startsWith('@')) c = c.substring(1); return '@' + c; }

function getLineupSignature(lineup) {
    if (!lineup || lineup.length === 0) return "";
    return lineup.map(g => (g.displayName || g.player?.displayName || "").trim()).sort().join('|');
}

function getFormattedDate(base, daysToAdd) {
    const d = new Date(base);
    d.setDate(d.getDate() + daysToAdd);
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
}

function base64ToText(b) {
    try {
        if (!b) return '';
        const decoded = window.atob(b.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    } catch(e) { return ''; }
}

// --- SEARCH BAR LOGIC ---
function filterLeaderboard() {
    const input = document.getElementById('player-search');
    if (!input) return;
    const filter = input.value.toLowerCase();
    const tbody = document.getElementById('leaderboard-tbody');
    if (!tbody) return;
    
    const rows = tbody.children;
    let currentMain = null;
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        if (row.classList.contains('cut-line-row')) {
            row.style.display = filter ? 'none' : '';
            continue;
        }
        
        if (row.classList.contains('main-row')) {
            currentMain = row;
            const nameEl = row.querySelector('.p-name');
            if (nameEl && nameEl.textContent.toLowerCase().includes(filter)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
                row.classList.remove('open');
            }
        } else if (row.classList.contains('draft-row')) {
            if (currentMain && currentMain.style.display === 'none') {
                row.classList.remove('open');
            }
        }
    }
}

// --- PRO LEADERBOARD ---
async function fetchProLeaderboard() {
    if (!currentGameId) return;
    const tbody = document.getElementById('pro-leaderboard-tbody');
    const statusEl = document.getElementById('pro-sync-status');
    
    try {
        const hasher = new Hashids("realwebapp", 16);
        const targetUrl = `https://web.realsports.io/games/${currentGameId}/sport/golf/stats`;
        const proxyUrl = `${config.workerProxy}?url=${encodeURIComponent(targetUrl)}`;
        const opts = { headers: { 'real-auth-info': config.REAL_AUTH_TOKEN, 'real-device-name': 'Chrome', 'real-device-type': 'desktop_web', 'real-device-uuid': DEVICE_UUID, 'real-request-token': hasher.encode(Date.now()), 'real-version': config.REAL_VERSION } };
        
        const response = await fetch(proxyUrl, opts);
        if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
        
        rawProLeaderboardData = await response.json();
        renderProLeaderboard();
    } catch (error) {
        if (tbody.innerHTML.includes('Loading')) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--danger);">Failed to load pro leaderboard. Ensure game ID is correct.</td></tr>';
            statusEl.innerHTML = '<span class="sync-dot" style="background:var(--danger); box-shadow:none;"></span>ERR';
        }
    }
}

function renderProLeaderboard() {
    if (!rawProLeaderboardData) return;
    const tbody = document.getElementById('pro-leaderboard-tbody');
    const statusEl = document.getElementById('pro-sync-status');
    
    const data = rawProLeaderboardData;
    const leaderboard = data.leaderboard || [];
    const cutLine = data.cutLine;
    
    if (leaderboard.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted);">Leaderboard not available yet.</td></tr>';
        return;
    }

    const rowsHtml = [];

    leaderboard.forEach((l, index) => {
        const pidStr = String(l.playerId);
        const pObj = l.player || globalPlayers[pidStr] || {};
        
        let name = pObj.displayName || pObj.lastName;
        if (!name && pObj.firstName && pObj.lastName) name = `${pObj.firstName[0]}. ${pObj.lastName}`;
        if (!name) name = l.playerName || l.name || 'Unknown';

        const avatar = pObj.avatar ? `https://media.realapp.link/assets/players/default/large/${pObj.avatar}.webp` : 'https://placehold.co/48x48/111/fff?text=?';
        const score = l.score || 'E';
        const thru = l.thru || '-';
        const pos = l.position || '-';
        
        const rawRating = l.value || pObj.value || (globalPlayers[pidStr] ? globalPlayers[pidStr].value : null);
        const rating = (rawRating !== null && rawRating !== undefined && !isNaN(parseFloat(rawRating))) ? parseFloat(rawRating).toFixed(2) : '-';
        
        const picks = globalPlayers[pidStr] ? (globalPlayers[pidStr].pickCount || 0) : 0;
        const picksBadge = picks > 0 ? `<span style="font-size: 0.65rem; color: var(--border-gold); font-weight: 800; background: rgba(197, 160, 89, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(197, 160, 89, 0.2); flex: 0 0 auto; margin-left: 6px;">👥 ${picks}</span>` : '';
        
        rowsHtml.push(`
            <tr class="main-row">
                <td class="col-pos">${pos}</td>
                <td class="col-player">
                    <div class="player-flex">
                        <img src="${avatar}" style="width: 24px; height: 24px; min-width: 24px; border-radius: 50%; border: 1px solid var(--border-gold); object-fit: cover;" onerror="this.src='https://placehold.co/48x48/111/fff?text=?'">
                        <span class="p-name">${name}</span>
                        ${picksBadge}
                    </div>
                </td>
                <td class="col-score">${formatToPar(score)}</td>
                <td class="col-score" style="color: var(--gold-light); font-weight: 800;">${rating}</td>
                <td class="col-stat" style="color: var(--text-muted);">${thru}</td>
            </tr>
        `);

        if (cutLine && cutLine.index === (index + 1)) {
            rowsHtml.push(`
                <tr class="cut-line-row">
                    <td colspan="5">${cutLine.displayText ? cutLine.displayText.toUpperCase() : 'OFFICIAL CUT LINE'}</td>
                </tr>
            `);
        }
    });

    tbody.innerHTML = rowsHtml.join('');
    statusEl.innerHTML = '<span class="sync-dot"></span>LIVE';
}

// --- MISSING SCORES INTERPOLATION ALGORITHM ---
function getInterpolatedPts(u, tDates, todayStr) {
    const normId = u.userId.trim().toLowerCase();
    const hist = historicalDailyDataByDate[normId] || {};
    const pts = [0, 0, 0, 0];
    
    tDates.forEach((d, i) => {
        if (hist[d]) pts[i] = hist[d].raw;
        else if (d === todayStr && u.hasData) pts[i] = u.actualTotalPoints;
    });
    
    let lastValidIdx = -1;
    let lastValidVal = 0;
    for (let i = 0; i < 4; i++) {
        if (pts[i] !== 0) {
            if (i - lastValidIdx > 1) {
                const gapCount = i - lastValidIdx;
                const diff = pts[i] - lastValidVal;
                const perDay = diff / gapCount;
                for (let j = lastValidIdx + 1; j < i; j++) {
                    pts[j] = (j === 0 ? 0 : pts[j - 1]) + perDay;
                }
            }
            lastValidIdx = i;
            lastValidVal = pts[i];
        }
    }
    return pts;
}

// --- DYNAMIC RANK BADGE COMPONENT ---
function getRankBadge(rank) {
    if (!rank) return '';
    if (rank === 1) return `<span class="season-rank-badge rank-1" title="Season Rank 1">👑 #1</span>`;
    if (rank === 2) return `<span class="season-rank-badge rank-2" title="Season Rank 2">🥈 #2</span>`;
    if (rank === 3) return `<span class="season-rank-badge rank-3" title="Season Rank 3">🥉 #3</span>`;
    if (rank <= 10) return `<span class="season-rank-badge rank-top10" title="Top 10 Season Rank">⭐ #${rank}</span>`;
    return `<span class="season-rank-badge" title="Season Rank">#${rank}</span>`;
}

function renderLeaderboard() {
    const tbody = document.getElementById('leaderboard-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const now = getNow();
    
    const todayStr = (now.getMonth() + 1) + '/' + now.getDate() + '/' + now.getFullYear();
    const tDates = [];
    if (activeTournamentStartDate) {
        for (let i = 0; i < 4; i++) tDates.push(getFormattedDate(activeTournamentStartDate, i));
    }

    const refSigs = [];
    users.filter(u => u.hasData).forEach(u => {
        if (REFERENCE_IDS.includes(u.userId.toLowerCase().trim())) {
            const sig = getLineupSignature(u.lineup);
            if (sig) refSigs.push(sig);
        }
    });

    const playerStates = users.map(u => {
        const pts = getInterpolatedPts(u, tDates, todayStr);
        
        const isWD = u.hasData && !u.syncFailed && (!u.lineup || u.lineup.length === 0);
        const normId = u.userId.trim().toLowerCase();
        const sig = getLineupSignature(u.lineup);
        const isRef = REFERENCE_IDS.includes(normId);
        const isDup = !isRef && sig !== "" && refSigs.includes(sig);
        
        const dayPieces = [pts[0], 0, 0, 0];
        for (let i = 1; i < 4; i++) {
            if (pts[i] !== 0 && pts[i-1] !== 0) {
                const diff = pts[i] - pts[i-1];
                dayPieces[i] = Math.abs(diff) < 0.01 ? 0 : diff;
            }
        }
        return { ...u, pts, dayPieces, isWD, isDuplicate: isDup };
    });

    const pools = [[], [], [], []];
    tDates.forEach((_, i) => {
        playerStates.forEach(p => {
            if (!p.isWD && !p.isDuplicate) {
                const piece = p.dayPieces[i];
                if (Math.abs(piece) > 0.01) pools[i].push(piece);
            }
        });
    });

    const activeIdx = tDates.indexOf(todayStr);
    const sortedPool = [...(activeIdx !== -1 ? pools[activeIdx] : [])].sort((a,b) => a - b);
    const medianVal = sortedPool.length ? (sortedPool.length % 2 ? sortedPool[Math.floor(sortedPool.length/2)] : (sortedPool[sortedPool.length/2-1] + sortedPool[sortedPool.length/2])/2) : 0;
    document.getElementById('par-score-display').innerText = `EVEN: ${medianVal.toFixed(2)} ${activeIdx === 0 ? 'PTS' : 'IMPROVE'}`;

    const isNoCut = globalTournamentCutRules[activeTournamentKey] || false;

    const friField = playerStates.map(p => {
        const thuG = Math.abs(p.dayPieces[0]) > 0.01 ? calculateGolfScore(p.dayPieces[0], pools[0]) : 0;
        const friG = Math.abs(p.dayPieces[1]) > 0.01 ? calculateGolfScore(p.dayPieces[1], pools[1]) : 0;
        return { userId: p.userId, totFri: thuG + friG, isWD: p.isWD, isDup: p.isDuplicate };
    }).filter(f => !f.isWD && !f.isDup);
    friField.sort((a,b) => a.totFri - b.totFri);
    
    const cutIdxFri = Math.floor(friField.length * 0.45);
    globalCutScoreFri = isNoCut ? 999 : (friField.length > 0 ? friField[Math.max(0,
