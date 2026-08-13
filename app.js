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
const REFERENCE_IDS = ['jvbb41pv', 'gv8D5Q0v', '9JmXRKDn'].map(id => id.toLowerCase().trim());

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

// --- RANKINGS SEARCH LOGIC ---
function filterRankings() {
    const input = document.getElementById('rankings-search');
    if (!input) return;
    const filter = input.value.toLowerCase();
    const tbody = document.getElementById('rankings-tbody');
    if (!tbody) return;
    
    const rows = tbody.children;
    let currentMain = null;
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
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

// --- REFRESH BUTTON LOGIC ---
function forceRefresh() {
    const btn = document.querySelector('.refresh-btn');
    if (btn) btn.classList.add('spinning');
    
    document.getElementById('sync-status').innerHTML = '<span class="sync-dot" style="background:var(--border-gold); box-shadow:0 0 10px var(--border-gold);"></span>SYNCING';
    
    users.forEach(u => {
        u.hasData = false;
        u.syncFailed = false;
        u.retries = 0;
        u.lineup = [];
    });
    
    if (currentGameId) fetchProLeaderboard();
    
    loadAllUserScores().then(() => {
        if (btn) btn.classList.remove('spinning');
    });
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
    globalCutScoreFri = isNoCut ? 999 : (friField.length > 0 ? friField[Math.max(0, cutIdxFri - 1)].totFri : 99);

    const slotKeys = ['thu', 'fri', 'sat', 'sun'];
    currentProcessedUsers = playerStates.map(p => {
        let rounds = { thu: 0, fri: 0, sat: 0, sun: 0 };
        rounds.thu = Math.abs(p.dayPieces[0]) > 0.01 ? calculateGolfScore(p.dayPieces[0], pools[0]) : 0;
        rounds.fri = Math.abs(p.dayPieces[1]) > 0.01 ? calculateGolfScore(p.dayPieces[1], pools[1]) : 0;
        
        const madeCut = isNoCut ? true : ((rounds.thu + rounds.fri) <= globalCutScoreFri);
        
        if (madeCut) {
            rounds.sat = Math.abs(p.dayPieces[2]) > 0.01 ? calculateGolfScore(p.dayPieces[2], pools[2]) : 0;
            rounds.sun = Math.abs(p.dayPieces[3]) > 0.01 ? calculateGolfScore(p.dayPieces[3], pools[3]) : 0;
        }
        const total = rounds.thu + rounds.fri + rounds.sat + rounds.sun;
        return { ...p, total, today: activeIdx !== -1 ? rounds[slotKeys[activeIdx]] : 0, rounds, actualTotalPoints: (activeIdx !== -1 && p.pts[activeIdx] !== 0) ? p.pts[activeIdx] : (p.hasData ? p.actualTotalPoints : 0), madeCut };
    });

    currentProcessedUsers.sort((a, b) => {
        const aInv = a.isWD || a.isDuplicate || a.syncFailed;
        const bInv = b.isWD || b.isDuplicate || b.syncFailed;
        if (aInv !== bInv) return aInv ? 1 : -1;
        if (aInv && bInv) { if (a.isWD !== b.isWD) return a.isWD ? -1 : 1; return 0; }
        if (a.madeCut !== b.madeCut) return a.madeCut ? -1 : 1; 
        if (a.total !== b.total) return a.total - b.total;
        return b.actualTotalPoints - a.actualTotalPoints;
    });

    const validField = currentProcessedUsers.filter(x => !x.isWD && !x.isDuplicate && !x.syncFailed);
    const isFinalDay = activeIdx === 3 || activeIdx === -1; 

    let vfIdx = 0;
    while (vfIdx < validField.length) {
        let j = vfIdx;
        while (j < validField.length && validField[j].total === validField[vfIdx].total && validField[j].madeCut === validField[vfIdx].madeCut) {
            j++;
        }
        
        const groupSize = j - vfIdx;

        if (vfIdx === 0 && isFinalDay) {
            validField[0].displayPos = "1";
            for (let k = 1; k < j; k++) {
                validField[k].displayPos = "T2"; 
            }
        } else {
            for (let k = vfIdx; k < j; k++) {
                validField[k].displayPos = groupSize > 1 ? 'T' + (vfIdx + 1) : (vfIdx + 1).toString();
            }
        }
        
        vfIdx = j;
    }

    let cutLineInserted = false;
    currentProcessedUsers.forEach((u, i) => {
        if (!isNoCut && !cutLineInserted && !u.madeCut && !u.isWD && !u.isDuplicate && !u.syncFailed) {
            const row = document.createElement('tr'); row.className = 'cut-line-row';
            row.innerHTML = `<td colspan="4">${activeIdx < 2 ? 'EXPECTED CUT LINE' : 'OFFICIAL CUT LINE'} (${formatToPar(globalCutScoreFri)})</td>`;
            tbody.appendChild(row); cutLineInserted = true;
        }
        const row = document.createElement('tr'); row.className = 'main-row';
        const tag = u.isDuplicate ? '(DUP)' : (u.syncFailed ? '(ERR)' : (activeIdx >= 2 && !u.madeCut ? '(MC)' : ''));
        
        const pos = (u.isWD) ? 'WD' : (u.isDuplicate) ? 'DUP' : (u.syncFailed ? 'ERR' : (u.hasData ? u.displayPos : '-'));
        
        const userRank = globalSeasonRanks[u.userId.toLowerCase()] || globalSeasonRanks[u.username.toLowerCase()];
        const rankBadge = getRankBadge(userRank);
        
        const playerContent = `<div class="player-flex">${rankBadge}<span class="p-name">${formatHandle(u.username)}</span>${tag ? `<span class="p-tag">${tag}</span>` : ''}<span class="toggle-icon">▼</span></div>`;
        row.innerHTML = `<td class="col-pos">${pos}</td><td class="col-player">${playerContent}</td><td class="col-score">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':formatToPar(u.total)}</td><td class="col-score">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':formatToPar(u.today)}</td>`;
        
        const dr = document.createElement('tr'); dr.className = 'draft-row';
        const satVal = u.madeCut ? formatToPar(u.rounds.sat) : '<div class="score-box mc">MC</div>';
        const sunVal = u.madeCut ? formatToPar(u.rounds.sun) : '<div class="score-box mc">MC</div>';
        const sanitize = (val) => (val === 0 ? 0 : val).toFixed(2);
        dr.innerHTML = `<td colspan="4"><div class="expanded-container"><div class="round-breakdown">
            <div class="round-slot"><span class="round-label">Thu</span><span class="round-val">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':formatToPar(u.rounds.thu)}</span><span class="round-piece">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':sanitize(u.dayPieces[0])} PTS</span></div>
            <div class="round-slot"><span class="round-label">Fri</span><span class="round-val">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':formatToPar(u.rounds.fri)}</span><span class="round-piece">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':sanitize(u.dayPieces[1])} PTS</span></div>
            <div class="round-slot"><span class="round-label">Sat</span><span class="round-val">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':satVal}</span><span class="round-piece">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':sanitize(u.dayPieces[2])} PTS</span></div>
            <div class="round-slot"><span class="round-label">Sun</span><span class="round-val">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':sunVal}</span><span class="round-piece">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':sanitize(u.dayPieces[3])} PTS</span></div>
        </div><div class="raw-pts-display">Total Raw Score: ${u.actualTotalPoints.toFixed(2)} ${u.isWD?'(WD)':(u.syncFailed?'(ERR)':'')}</div><div class="draft-grid"></div></div></td>`;
        
        row.onclick = function() {
            const isOpen = this.classList.contains('open');
            document.querySelectorAll('.main-row').forEach(r => r.classList.remove('open'));
            document.querySelectorAll('.draft-row').forEach(r => r.classList.remove('open'));
            if (!isOpen) { this.classList.add('open'); dr.classList.add('open'); renderDraft(u, dr.querySelector('.draft-grid')); }
        };
        tbody.appendChild(row); tbody.appendChild(dr);
    });

    filterLeaderboard();
}

// --- RANKINGS LOGIC ---
function getSeasonPoints(pos, status, multiplier = 1) {
    if (status === "WD" || status === "DUP") return 0;
    if (!pos) return 0;
    
    const cleanPos = String(pos).replace(/\D/g, '');
    const p = parseInt(cleanPos); 
    if (isNaN(p)) return 0;

    let base = 0;
    if (p === 1) base = 100;
    else if (p === 2) base = 60;
    else if (p === 3) base = 45;
    else if (p === 4) base = 35;
    else if (p === 5) base = 30;
    else if (p === 6) base = 25;
    else if (p === 7) base = 22;
    else if (p === 8) base = 20;
    else if (p === 9) base = 18;
    else if (p === 10) base = 16;
    else if (p >= 11 && p <= 20) base = 14 - (p - 11);
    else if (p >= 21) {
        if (status == "MADE CUT") base = 3;
        else base = 2;        
    }

    return Math.round(base * multiplier);
}

function getProcessedTournaments() {
    if (processedTournamentsCache) return processedTournamentsCache;
    if (!masterArchiveData || masterArchiveData.length < 2) return {};

    const h = masterArchiveData[0].map(v => v.toLowerCase().trim());
    const tIdx = findIdx(h, ['tournament', 'tourn']);
    const uIdx = findIdx(h, ['username']);
    const uidIdx = findIdx(h, ['user id', 'userid']);
    const sIdx = findIdx(h, ['status']);
    const epIdx = findIdx(h, ['event type', 'tier']);

    const tournaments = {};

    masterArchiveData.slice(1).forEach(r => {
        const tName = r[tIdx];
        if (!tName) return;
        
        const tNameKey = tName.trim().toLowerCase();
        let multiplier = globalTournamentTiers[tNameKey] || 1.0;
        
        if (epIdx !== -1 && r[epIdx]) {
            const val = r[epIdx].toString().toLowerCase().trim();
            if (val.includes('major') || val.includes('players') || val.includes('playoff')) multiplier = 1.5;
            else if (val.includes('signature')) multiplier = 1.4;
            else if (val.includes('regular')) multiplier = 1.0;
        }

        if (!tournaments[tName]) tournaments[tName] = [];
        
        const isNoCut = globalTournamentCutRules[tNameKey] || false;
        
        tournaments[tName].push({
            r,
            username: r[uIdx]?.trim(),
            userId: uidIdx !== -1 ? r[uidIdx]?.trim() : null,
            totalGolf: parseInt(r[4]) || 0,
            totalRaw: parseFloat(r[9]) || 0,
            madeCut: isNoCut ? true : (r[sIdx]?.toUpperCase() === "MADE CUT"),
            status: r[sIdx]?.toUpperCase(),
            rounds: { thu: r[5], fri: r[6], sat: r[7], sun: r[8] },
            pieces: { thu: parseFloat(r[10])||0, fri: (parseFloat(r[11])||0) - (parseFloat(r[10])||0), sat: (parseFloat(r[12])||0) - (parseFloat(r[11])||0), sun: (parseFloat(r[13])||0) - (parseFloat(r[12])||0) },
            multiplier: multiplier
        });
    });

    Object.keys(tournaments).forEach(tName => {
        const field = tournaments[tName];
        
        field.sort((a,b) => {
            const aInv = a.status === "WD" || a.status === "DUP";
            const bInv = b.status === "WD" || b.status === "DUP";
            if (aInv !== bInv) return aInv ? 1 : -1;
            if (a.madeCut !== b.madeCut) return a.madeCut ? -1 : 1;
            if (a.totalGolf !== b.totalGolf) return a.totalGolf - b.totalGolf;
            return b.totalRaw - a.totalRaw;
        });

        const validArchive = field.filter(x => x.status !== "WD" && x.status !== "DUP");
        let vfIdx = 0;
        while (vfIdx < validArchive.length) {
            let j = vfIdx;
            while (j < validArchive.length && validArchive[j].totalGolf === validArchive[vfIdx].totalGolf && validArchive[j].madeCut === validArchive[vfIdx].madeCut) {
                j++;
            }
            const groupSize = j - vfIdx;

            if (vfIdx === 0) {
                validArchive[0].displayPos = "1";
                for (let k = 1; k < j; k++) {
                    validArchive[k].displayPos = "T2"; 
                }
            } else {
                for (let k = vfIdx; k < j; k++) {
                    validArchive[k].displayPos = groupSize > 1 ? 'T' + (vfIdx + 1) : (vfIdx + 1).toString();
                }
            }
            vfIdx = j;
        }
    });

    processedTournamentsCache = tournaments;
    return tournaments;
}

function calculateGlobalRanks() {
    const tournaments = getProcessedTournaments();
    const stats = {};

    // 1. Build a universal resolver to map any known username to a User ID
    const usernameResolver = {};
    
    // Check live users first
    users.forEach(u => {
        if (u.userId) {
            if (u.username) usernameResolver[u.username.toLowerCase().trim()] = u.userId.toLowerCase().trim();
            if (u.originalUsername) usernameResolver[u.originalUsername.toLowerCase().trim()] = u.userId.toLowerCase().trim();
        }
    });
    
    // Check archive for any historical username -> ID mappings
    Object.keys(tournaments).forEach(tName => {
        tournaments[tName].forEach(p => {
            if (p.username && p.userId) {
                usernameResolver[p.username.toLowerCase().trim()] = p.userId.toLowerCase().trim();
            }
        });
    });

    Object.keys(tournaments).forEach(tName => {
        const field = tournaments[tName];
        field.forEach(p => {
            if (!p.username && !p.userId) return; // Must have at least one to map
            
            const lowerName = p.username ? p.username.toLowerCase().trim() : '';
            let uid = p.userId ? p.userId.toLowerCase().trim() : null;
            
            // 2. If the archive row is missing a User ID, try to find it using the resolver!
            if (!uid && lowerName && usernameResolver[lowerName]) {
                uid = usernameResolver[lowerName];
            }
            
            // 3. Group strictly by User ID. Only fallback to username if we have absolutely no ID anywhere.
            const key = uid ? uid : lowerName;
            
            if (!stats[key]) stats[key] = { points: 0, wins: 0, starts: 0, uid: uid, username: p.username, history: [] };
            
            if (p.status !== "WD" && p.status !== "DUP") {
                stats[key].starts += 1;
                const earnedPts = getSeasonPoints(p.displayPos, p.status, p.multiplier);
                stats[key].points += earnedPts;
                if (p.displayPos === "1" && p.status === "MADE CUT") stats[key].wins += 1;
                
                stats[key].history.push({
                    name: tName,
                    pos: p.displayPos,
                    points: earnedPts
                });
            }
        });
    });

    Object.values(stats).forEach(s => {
        if (s.uid) {
            const liveUser = users.find(u => u.userId && u.userId.toLowerCase() === s.uid.toLowerCase());
            if (liveUser && liveUser.username) s.username = liveUser.username;
        }
    });

    globalSeasonStatsArray = Object.values(stats).sort((a,b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.starts - a.starts;
    });

    globalSeasonRanks = {}; 
    globalSeasonStatsArray.forEach((p, i) => {
        if (p.username) globalSeasonRanks[p.username.toLowerCase()] = i + 1;
        if (p.uid) globalSeasonRanks[p.uid.toLowerCase()] = i + 1;
    });
}

function renderRankings() {
    const tbody = document.getElementById('rankings-tbody');
    if (!tbody || globalSeasonStatsArray.length === 0) return;
    tbody.innerHTML = '';
    
    globalSeasonStatsArray.forEach((p, i) => {
        const mainRow = document.createElement('tr');
        mainRow.className = 'main-row';
        
        const playerContent = `<div class="player-flex"><span class="p-name">${formatHandle(p.username)}</span><span class="toggle-icon">▼</span></div>`;
        
        mainRow.innerHTML = `<td class="col-pos">${i+1}</td><td class="col-player">${playerContent}</td><td class="col-stat">${p.points}</td><td class="col-stat">${p.wins}</td><td class="col-stat">${p.starts}</td>`;
        
        const detailRow = document.createElement('tr');
        detailRow.className = 'draft-row';
        
        const historyHtml = p.history.map(h => `
            <div style="background: rgba(255,255,255,0.03); padding: 10px 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 10px;">
                <span style="font-size: 0.8rem; font-weight: 700; color: #fff; flex: 1 1 auto; line-height: 1.3;">${h.name}</span>
                <div style="text-align: right; flex: 0 0 auto; display: flex; justify-content: flex-end; align-items: center;">
                    <span style="font-size: 0.75rem; color: var(--text-muted); margin-right: 12px; width: 55px; text-align: left;">Pos: <strong style="color: #fff;">${h.pos}</strong></span>
                    <span style="font-size: 0.85rem; color: var(--gold-light); font-weight: 900; width: 50px; text-align: right;">+${h.points}</span>
                </div>
            </div>
        `).join('');
        
        detailRow.innerHTML = `<td colspan="5">
            <div class="expanded-container">
                <div style="font-size: 0.7rem; color: var(--border-gold); font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px;">Tournament History</div>
                ${historyHtml || '<div style="font-size: 0.75rem; color: var(--text-muted);">No history available.</div>'}
            </div>
        </td>`;
        
        mainRow.onclick = () => {
            const isOpen = mainRow.classList.contains('open');
            const tbodyEl = document.getElementById('rankings-tbody');
            tbodyEl.querySelectorAll('.main-row').forEach(r => r.classList.remove('open'));
            tbodyEl.querySelectorAll('.draft-row').forEach(r => r.classList.remove('open'));
            if (!isOpen) { 
                mainRow.classList.add('open'); 
                detailRow.classList.add('open'); 
            }
        };
        
        tbody.appendChild(mainRow);
        tbody.appendChild(detailRow);
    });
    
    // Apply filtering immediately in case user already typed something in the search bar
    filterRankings();
}

function renderDraft(u, container) {
    if (!container) return;
    if (u.syncFailed) { container.innerHTML = '<div style="flex:1; text-align:center; font-size:0.7rem; color:var(--text-muted); padding:10px;">Failed to load data (Rate limited or not found). Please refresh later.</div>'; return; }
    if (!u.hasData) { container.innerHTML = '<div style="flex:1; text-align:center; font-size:0.7rem; padding:10px;">Syncing...</div>'; return; }
    if (u.isWD) { container.innerHTML = `<div style="flex:1; text-align:center; font-size:0.7rem; color:var(--danger); padding:10px;">PLAYER WITHDRAWN</div>`; return; }
    
    let dupWarning = u.isDuplicate ? `<div style="width:100%; text-align:center; font-size:0.75rem; color:var(--danger); font-weight:900; margin-bottom:12px; letter-spacing:0.05em; background:rgba(255,85,85,0.1); padding:8px; border-radius:6px; border:1px solid rgba(255,85,85,0.3);">DUPLICATE ENTRY - ZERO POINTS</div>` : '';
    
    let lineupHtml = '';
    if (u.lineup && u.lineup.length > 0) {
        lineupHtml = u.lineup.map(g => {
            const pObj = g.player || g || {};
            const avatarHash = pObj.avatar || g.avatar || '';
            const avatarStr = avatarHash ? `https://media.realapp.link/assets/players/default/large/${avatarHash}.webp` : 'https://placehold.co/48x48/111/fff?text=?';
            const nameStr = pObj.displayName || pObj.name || pObj.lastName || g.displayName || 'Unknown';
            const scoreStr = (parseFloat(g.score) || 0).toFixed(2);
            
            return `<div class="draft-item">
                <img src="${avatarStr}" class="draft-item-avatar" onerror="this.src='https://placehold.co/48x48/111/fff?text=?'">
                <span class="draft-item-name">${nameStr}</span>
                <span class="draft-item-score">${scoreStr}</span>
            </div>`;
        }).join('');
    } else {
        lineupHtml = '<div style="width:100%; text-align:center; padding:10px; font-size:0.8rem; color:var(--text-muted);">Lineup data not available.</div>';
    }
    
    container.innerHTML = dupWarning + lineupHtml;
}

function generateCSV(rows, filename) {
    const blob = new Blob([rows.map(e => e.join(",")).join("\n")], { type: 'text/csv' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename; link.click();
}

function exportScoresToCSV() {
    const rows = [["position", "username", "user id", "status", "total_golf", "thu_golf", "fri_golf", "sat_golf", "sun_golf", "total_raw", "thu_raw", "fri_raw", "sat_raw", "sun_raw"]];
    currentProcessedUsers.forEach((u, i) => { 
        if(u.hasData) {
            let status = u.madeCut ? "MADE CUT" : "MISSED CUT";
            if (u.isWD) status = "WD"; else if (u.isDuplicate) status = "DUP";
            
            const exportPos = u.isWD ? 'WD' : (u.isDuplicate ? 'DUP' : (u.syncFailed ? 'ERR' : u.displayPos));
            
            rows.push([ exportPos, u.username, u.userId, status, u.total, u.rounds.thu, u.rounds.fri, u.rounds.sat, u.rounds.sun, u.actualTotalPoints.toFixed(2), u.pts[0].toFixed(2), u.pts[1].toFixed(2), u.pts[2].toFixed(2), u.pts[3].toFixed(2) ]); 
        }
    });
    generateCSV(rows, `golf_plug_full_records.csv`);
    document.getElementById('export-menu').style.display = 'none';
}

function exportDay(dayName) {
    const dayMap = { thursday: 0, friday: 1, saturday: 2, sunday: 3 };
    const targetDayIdx = dayMap[dayName];
    if (targetDayIdx === undefined) return;
    
    const now = getNow();
    const todayStr = (now.getMonth() + 1) + '/' + now.getDate() + '/' + now.getFullYear();

    const tDates = [];
    for (let i = 0; i < 4; i++) tDates.push(getFormattedDate(activeTournamentStartDate, i));

    const targetDateStr = tDates[targetDayIdx];
    const rows = [["username", "user id", "raw points", "golf score", "date"]];

    const daysToExport = [];
    for (let i = 0; i <= targetDayIdx; i++) {
        const dStr = tDates[i];
        const isMissing = !Object.values(historicalDailyDataByDate).some(hist => hist[dStr] !== undefined);
        
        if (i === targetDayIdx || isMissing) {
            daysToExport.push(i);
        }
    }

    daysToExport.forEach(dayIdx => {
        const dateStr = tDates[dayIdx];
        const tempPool = [];
        
        const tempUsers = users.map(u => {
            const pts = getInterpolatedPts(u, tDates, todayStr);
            
            const priorCumulative = dayIdx > 0 ? pts[dayIdx - 1] : 0;
            const liveCumulative = pts[dayIdx]; 
            
            let dailyPiece = liveCumulative - priorCumulative;
            if (Math.abs(dailyPiece) < 0.01) dailyPiece = 0;

            const sig = getLineupSignature(u.lineup);
            
            return { u, liveCumulative, dailyPiece, sig };
        });

        const refSigs = tempUsers.filter(x => REFERENCE_IDS.includes(x.u.userId.toLowerCase().trim()) && x.sig).map(x => x.sig);
        
        tempUsers.forEach(x => {
            x.isDup = !REFERENCE_IDS.includes(x.u.userId.toLowerCase().trim()) && x.sig !== "" && refSigs.includes(x.sig);
            
            if (!x.isDup && Math.abs(x.dailyPiece) > 0.01) {
                tempPool.push(x.dailyPiece);
            }
        });

        tempUsers.forEach(x => {
            if (x.u.hasData) {
                let golfScore = 0;
                if (!x.isDup && Math.abs(x.dailyPiece) > 0.01) {
                    golfScore = calculateGolfScore(x.dailyPiece, tempPool);
                }
                
                rows.push([x.u.username, x.u.userId, x.liveCumulative.toFixed(2), golfScore, dateStr]);
            }
        });
    });
    
    generateCSV(rows, `golf_plug_${dayName}_${targetDateStr.replace(/\//g, '-')}.csv`);
    document.getElementById('export-menu').style.display = 'none';
}

function exportWDsToCSV() {
    const rows = [["username", "user id"]];
    users.forEach(u => {
        const isWD = u.hasData && !u.syncFailed && (!u.lineup || u.lineup.length === 0);
        if (isWD) {
            rows.push([u.username, u.userId]);
        }
    });
    generateCSV(rows, `golf_plug_withdrawals.csv`);
    document.getElementById('export-menu').style.display = 'none';
}

function exportNameUpdatesToCSV() {
    const rows = [["username", "user id"]];
    users.forEach(u => {
        rows.push([u.username, u.userId]);
    });
    
    generateCSV(rows, `golf_plug_usernames.csv`);
    document.getElementById('export-menu').style.display = 'none';
}

function viewArchive(name) {
    const tournaments = getProcessedTournaments();
    const processedArchive = tournaments[name];
    if (!processedArchive) return;

    const tbody = document.getElementById('archive-tbody');
    const champDiv = document.getElementById('archive-champ-display');
    
    const tTypeData = globalTournamentTypes[name.toLowerCase()] || { display: 'REGULAR', cssClass: 'regular' };
    document.getElementById('archive-header-title').innerHTML = `<span style="font-weight: 900; font-size: 0.8rem; letter-spacing: 0.05em; display:flex; align-items:center; flex-wrap:wrap; gap:8px;">🏆 ${name.toUpperCase()} <span class="tier-badge ${tTypeData.cssClass}">${tTypeData.display}</span> <span style="color:var(--text-muted); font-weight:700; font-size:0.65rem;">FINAL RESULTS</span></span>`;

    const validArchive = processedArchive.filter(x => x.status !== "WD" && x.status !== "DUP");

    if (validArchive.length > 0) {
        const winner = validArchive[0];
        let winnerName = winner.username;
        if (winner.userId) {
            const liveUser = users.find(u => u.userId.toLowerCase() === winner.userId.toLowerCase());
            if (liveUser && liveUser.username) winnerName = liveUser.username;
        }
        const displayScore = winner.totalGolf === 0 ? 'E' : (winner.totalGolf > 0 ? '+' + winner.totalGolf : winner.totalGolf);
        champDiv.innerHTML = `<div class="champion-spotlight"><div class="champ-label">Tournament Champion</div><div class="champ-name">🏆 ${formatHandle(winnerName)}</div><div class="champ-score">Final Score: ${displayScore} (${winner.totalRaw.toFixed(2)} PTS)</div></div>`;
    } else { champDiv.innerHTML = ''; }

    let cutInserted = false;
    tbody.innerHTML = '';
    processedArchive.forEach((item) => {
        const isInv = item.status === "WD" || item.status === "DUP";
        if (!cutInserted && !item.madeCut && !isInv) {
            const cr = document.createElement('tr'); cr.className = 'cut-line-row';
            cr.innerHTML = `<td colspan="4">OFFICIAL CUT LINE</td>`;
            tbody.appendChild(cr); cutInserted = true;
        }
        const mainRow = document.createElement('tr'); mainRow.className = 'main-row';
        const tag = (item.status === "DUP") ? '(DUP)' : (item.status === "WD") ? '(WD)' : (!item.madeCut ? '(MC)' : '');
        
        let displayUsername = item.username;
        if (item.userId) {
            const liveUser = users.find(u => u.userId.toLowerCase() === item.userId.toLowerCase());
            if (liveUser && liveUser.username) displayUsername = liveUser.username;
        }
        
        const userRank = globalSeasonRanks[displayUsername.toLowerCase()] || (item.userId ? globalSeasonRanks[item.userId.toLowerCase()] : null);
        const rankBadge = getRankBadge(userRank);
        
        const playerContent = `<div class="player-flex">${rankBadge}<span class="p-name">${formatHandle(displayUsername)}</span>${tag ? `<span class="p-tag">${tag}</span>` : ''}<span class="toggle-icon">▼</span></div>`;
        
        const displayPosition = isInv ? item.status : item.displayPos;
        
        mainRow.innerHTML = `<td class="col-pos">${displayPosition}</td><td class="col-player">${playerContent}</td><td class="col-score">${isInv?'-':formatToPar(item.totalGolf)}</td><td class="col-score">${item.totalRaw.toFixed(2)}</td>`;
        const detailRow = document.createElement('tr'); detailRow.className = 'draft-row';
        const satDisp = item.madeCut ? formatToPar(item.rounds.sat) : (isInv ? '-' : '<div class="score-box mc">MC</div>');
        const sunDisp = item.madeCut ? formatToPar(item.rounds.sun) : (isInv ? '-' : '<div class="score-box mc">MC</div>');
        detailRow.innerHTML = `<td colspan="4"><div class="expanded-container"><div class="round-breakdown">
            <div class="round-slot"><span class="round-label">Thu</span><span class="round-val">${isInv?'-':formatToPar(item.rounds.thu)}</span><span class="round-piece">${isInv?'-':item.pieces.thu.toFixed(2)} PTS</span></div>
            <div class="round-slot"><span class="round-label">Fri</span><span class="round-val">${isInv?'-':formatToPar(item.rounds.fri)}</span><span class="round-piece">${isInv?'-':item.pieces.fri.toFixed(2)} PTS</span></div>
            <div class="round-slot"><span class="round-label">Sat</span><span class="round-val">${satDisp}</span><span class="round-piece">${isInv?'-':item.pieces.sat.toFixed(2)} PTS</span></div>
            <div class="round-slot"><span class="round-label">Sun</span><span class="round-val">${sunDisp}</span><span class="round-piece">${isInv?'-':item.pieces.sun.toFixed(2)} PTS</span></div>
        </div><div class="raw-pts-display">Final Raw Score: ${item.totalRaw.toFixed(2)}</div></div></td>`;
        mainRow.onclick = () => {
            const isOpen = mainRow.classList.contains('open');
            document.querySelectorAll('.main-row').forEach(r => r.classList.remove('open'));
            document.querySelectorAll('.draft-row').forEach(r => r.classList.remove('open'));
            if (!isOpen) { mainRow.classList.add('open'); detailRow.classList.add('open'); }
        };
        tbody.appendChild(mainRow); tbody.appendChild(detailRow);
    });
    document.getElementById('past-tournament-grid').style.display = 'none';
    document.getElementById('archive-viewer').style.display = 'block';
}

const findIdx = (h, n) => { for(const name of n) { const i = h.findIndex(x => x.toLowerCase().trim().includes(name.toLowerCase())); if(i !== -1) return i; } return -1; };

async function fetchDailyHistoricalData() {
    try {
        const res = await fetch(config.dailyDataUrl);
        const text = await res.text();
        const rows = parseCSV(text);
        const h = rows[0].map(v => v.toLowerCase().trim());
        const uIdx = findIdx(h, ['user id', 'userid']), dIdx = findIdx(h, ['date']), rIdx = findIdx(h, ['raw points', 'raw pts']), gIdx = findIdx(h, ['golf score']);
        if (uIdx === -1 || dIdx === -1) return;
        
        const validDates = new Set();
        if (activeTournamentStartDate) {
            for (let i = 0; i < 4; i++) {
                validDates.add(getFormattedDate(activeTournamentStartDate, i));
            }
        }

        rows.slice(1).forEach(r => {
            const uid = r[uIdx]?.trim().toLowerCase(); 
            const date = r[dIdx]?.trim();
            if (!uid || !date) return;
            
            if (validDates.size === 0 || validDates.has(date)) {
                if (!historicalDailyDataByDate[uid]) historicalDailyDataByDate[uid] = {};
                historicalDailyDataByDate[uid][date] = { score: parseFloat(r[gIdx]) || 0, raw: parseFloat(r[rIdx]) || 0 };
            }
        });
    } catch (e) {}
}

async function loadAllUserScores() {
    users.forEach(u => {
        if (!u.golfId || u.golfId.trim() === '') {
            u.hasData = true;
            u.syncFailed = false;
            u.lineup = []; 
        }
    });

    const validUsers = [...users].filter(u => u.golfId && u.userId);
    validUsers.forEach(u => { u.retries = 0; u.syncFailed = false; });
    
    let q = [...validUsers];
    let loaded = 0; 
    const statusEl = document.getElementById('sync-status');
    const hasher = new Hashids("realwebapp", 16);
    const MAX_RETRIES = 10; 
    const CONCURRENCY_LIMIT = 8; 
    
    let nextRequestTime = Date.now(); 
    let currentPacing = 200; 
    let globalPauseUntil = 0; 
    
    async function syncWorker() {
        while (q.length > 0) {
            const user = q.shift();
            if (!user) break;

            if (Date.now() < globalPauseUntil) {
                await new Promise(r => setTimeout(r, 100));
                q.unshift(user);
                continue;
            }

            const now = Date.now();
            let delay = 0;
            if (nextRequestTime > now) {
                delay = nextRequestTime - now;
                nextRequestTime += currentPacing;
            } else {
                nextRequestTime = now + currentPacing;
            }
            if (delay > 0) await new Promise(r => setTimeout(r, delay));

            try {
                const targetUrl = `https://web.realsports.io/games/playerratingcontest/${user.golfId}/view/${user.userId}?contestType=sport&source=home`;
                const proxyUrl = `${config.workerProxy}?url=${encodeURIComponent(targetUrl)}`;
                
                const opts = { headers: { 'real-auth-info': config.REAL_AUTH_TOKEN, 'real-device-name': 'Chrome', 'real-device-type': 'desktop_web', 'real-device-uuid': DEVICE_UUID, 'real-request-token': hasher.encode(Date.now()), 'real-version': config.REAL_VERSION } };
                const response = await fetch(proxyUrl, opts);
                
                if (response.status === 429 || response.status === 502) {
                    globalPauseUntil = Date.now() + 1200; 
                    nextRequestTime = Date.now() + 1200;
                    currentPacing = Math.min(currentPacing + 50, 1000); 
                    
                    user.retries++;
                    if (user.retries < MAX_RETRIES) {
                        q.unshift(user); 
                    } else { 
                        user.hasData = true; user.syncFailed = true; loaded++; 
                    }
                } else if (response.ok) {
                    currentPacing = Math.max(currentPacing - 2, 125); 
                    const data = await response.json();
                    
                    if (!currentGameId) { 
                        let foundId = null;
                        
                        if (data.lineup && data.lineup.length > 0) {
                            foundId = data.lineup[0].matchId || data.lineup[0].gameId || data.lineup[0].eventId;
                        }
                        
                        if (!foundId) {
                            JSON.stringify(data, (key, value) => {
                                if (!foundId && ['gameId', 'matchId', 'eventId', 'tournamentId'].includes(key)) {
                                    if (/^\d{7,10}$/.test(String(value))) {
                                        foundId = String(value);
                                    }
                                }
                                return value;
                            });
                        }

                        if (foundId && /^\d+$/.test(String(foundId))) {
                            currentGameId = String(foundId);
                            fetchProLeaderboard();
                        }
                    }

                    let foundUsername = null;
                    const targetUid = String(user.userId).toLowerCase();
                    
                    function deepSearchName(obj) {
                        if (foundUsername || !obj || typeof obj !== 'object') return;
                        
                        if (obj.id !== undefined && String(obj.id).toLowerCase() === targetUid) {
                            if (obj.username) foundUsername = obj.username;
                            else if (obj.userName) foundUsername = obj.userName;
                        }
                        if (!foundUsername && obj.username && (String(obj.userId).toLowerCase() === targetUid || String(obj.ownerId).toLowerCase() === targetUid)) {
                            foundUsername = obj.username;
                        }
                        
                        if (!foundUsername) {
                            Object.values(obj).forEach(val => {
                                if (val && typeof val === 'object') deepSearchName(val);
                            });
                        }
                    }
                    deepSearchName(data);

                    if (!foundUsername) {
                        const now2 = Date.now();
                        let delay2 = 0;
                        if (nextRequestTime > now2) {
                            delay2 = nextRequestTime - now2;
                            nextRequestTime += currentPacing;
                        } else {
                            nextRequestTime = now2 + currentPacing;
                        }
                        if (delay2 > 0) await new Promise(r => setTimeout(r, delay2));

                        try {
                            const profUrl = `https://web.realsports.io/users/${user.userId}`;
                            const profProxy = `${config.workerProxy}?url=${encodeURIComponent(profUrl)}`;
                            const profRes = await fetch(profProxy, opts);
                            
                            if (profRes.status === 429 || profRes.status === 502) {
                                globalPauseUntil = Date.now() + 1200;
                                nextRequestTime = Date.now() + 1200;
                            } else if (profRes.ok) {
                                const profData = await profRes.json();
                                if (profData.username) foundUsername = profData.username;
                            }
                        } catch(e) {}
                    }

                    if (foundUsername && foundUsername.trim() !== '') {
                        user.username = foundUsername.trim();
                    }

                    user.actualTotalPoints = parseFloat((data.info?.rankDisplayInfos?.[0]?.scoreDisplay || '0').replace(/[^0-9.]/g, '')) || 0;
                    user.lineup = data.lineup || [];
                    
                    user.lineup.forEach(g => {
                        const pObj = g.player || {};
                        const pid = String(g.playerId || pObj.id || g.id);
                        if (pid && pid !== 'undefined') {
                            globalPlayers[pid] = {
                                displayName: pObj.displayName || g.displayName || globalPlayers[pid]?.displayName,
                                lastName: pObj.lastName || g.lastName || globalPlayers[pid]?.lastName,
                                firstName: pObj.firstName || g.firstName || globalPlayers[pid]?.firstName,
                                avatar: pObj.avatar || g.avatar || globalPlayers[pid]?.avatar,
                                id: pid,
                                value: (g.score !== undefined && g.score !== null) ? g.score : globalPlayers[pid]?.value,
                                pickCount: (globalPlayers[pid]?.pickCount || 0) + 1
                            };
                        }
                    });

                    user.actualTodayPoints = user.lineup.reduce((acc, g) => acc + (parseFloat(g.score) || 0), 0);
                    user.hasData = true;
                    loaded++;
                } else if (response.status === 404) {
                    user.hasData = true; user.syncFailed = true; loaded++;
                } else {
                    user.retries++;
                    if (user.retries < MAX_RETRIES) q.push(user);
                    else { user.hasData = true; user.syncFailed = true; loaded++; }
                }
            } catch (e) {
                globalPauseUntil = Date.now() + 1000;
                nextRequestTime = Date.now() + 1000;
                user.retries++;
                if (user.retries < MAX_RETRIES) q.unshift(user);
                else { user.hasData = true; user.syncFailed = true; loaded++; }
            }

            statusEl.innerHTML = `<span class="sync-dot"></span>${loaded}/${validUsers.length}`;
            
            if (loaded % 8 === 0 || q.length === 0) {
                renderLeaderboard();
                renderProLeaderboard(); 
            }
        }
    }

    const workers = [];
    for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
        workers.push(syncWorker());
    }
    
    await Promise.all(workers);
    
    calculateGlobalRanks();
    
    renderLeaderboard();
    renderProLeaderboard();
    if (document.getElementById('view-rankings').classList.contains('active')) renderRankings();
    
    statusEl.innerHTML = '<span class="sync-dot"></span>LIVE';
    
    if (!currentGameId) {
        const proTbody = document.getElementById('pro-leaderboard-tbody');
        const proStatus = document.getElementById('pro-sync-status');
        if (proTbody) proTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted);">Pro Leaderboard not linked.</td></tr>';
        if (proStatus) proStatus.innerHTML = '<span class="sync-dot" style="background:var(--text-muted); box-shadow:none;"></span>N/A';
    }
}

function parseCSV(t) { return t.split(/\r?\n/).map(l => { const v=[]; let c='', q=false; for(let i=0;i<l.length;i++){ if(l[i]==='"' && l[i-1]!=='\\') q=!q; else if(l[i]===',' && !q){ v.push(c.trim()); c=''; } else c+=l[i]; } v.push(c.trim()); return v; }).filter(r => r.length > 1); }

async function fetchTournamentSchedule() {
    try {
        const res = await fetch(config.scheduleUrl);
        const rows = parseCSV(await res.text());
        
        const now = getNow();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const h = rows[0].map(v => v.toLowerCase().trim());
        
        const dIdx = findIdx(h, ['date']), nIdx = findIdx(h, ['tourn', 'tournament']), cIdx = findIdx(h, ['course']);
        const etIdx = findIdx(h, ['event type', 'tier']); 
        const cutIdx = findIdx(h, ['cut', 'cut rule']); 
        
        const purseCols = [];
        h.forEach((colName, idx) => {
            const match = colName.match(/^purse\s+(\d+)$/);
            if (match) {
                purseCols.push({ index: idx, pos: parseInt(match[1], 10) });
            }
        });
        purseCols.sort((a, b) => a.pos - b.pos);
        
        const getOrdinal = (n) => {
            const s = ["TH", "ST", "ND", "RD"];
            const v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };
        
        const parseCurrency = (str) => {
            let clean = String(str).toLowerCase().trim();
            let mult = 1;
            if (clean.includes('k')) mult = 1000;
            if (clean.includes('m')) mult = 1000000;
            let num = parseFloat(clean.replace(/[^0-9.-]+/g, "")) || 0;
            return num * mult;
        };
        const formatCurrency = (num) => num.toLocaleString('en-US', {maximumFractionDigits: 0}) + ' RAX';

        const upcoming = [], past = []; let curr = null, next = null;
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i]; const p = (r[dIdx] || '').split('/'); if (p.length < 2) continue;
            const start = new Date(today.getFullYear(), parseInt(p[0]) - 1, parseInt(p[1]));
            const end = new Date(start); end.setDate(end.getDate() + 3);
            const rangeStr = `${start.getMonth()+1}/${start.getDate()} - ${end.getMonth()+1}/${end.getDate()}`;
            
            let multiplier = 1.0;
            let eventTypeDisplay = 'REGULAR';
            let safeClass = 'regular';
            
            if (etIdx !== -1 && r[etIdx]) {
                const rawVal = r[etIdx].toString().trim();
                const val = rawVal.toLowerCase();
                
                if (val.includes('major') || val.includes('players') || val.includes('playoff')) { 
                    multiplier = 1.5; 
                    eventTypeDisplay = rawVal.toUpperCase() || 'PLAYOFF'; 
                    safeClass = 'major'; 
                }
                else if (val.includes('signature')) { multiplier = 1.4; eventTypeDisplay = rawVal.toUpperCase() || 'SIGNATURE'; safeClass = 'signature'; }
                else if (val.includes('regular')) { multiplier = 1.0; eventTypeDisplay = rawVal.toUpperCase() || 'REGULAR'; safeClass = 'regular'; }
                else { eventTypeDisplay = rawVal.toUpperCase(); safeClass = 'regular'; }
            }

            let isNoCut = false;
            if (cutIdx !== -1 && r[cutIdx]) {
                const val = r[cutIdx].toString().toLowerCase().trim();
                if (val.includes('no cut') || val === 'no' || val === 'false') isNoCut = true;
            }
            if (etIdx !== -1 && r[etIdx]) {
                const etVal = r[etIdx].toString().toLowerCase().trim();
                if (etVal.includes('no cut') || etVal.includes('playoff')) isNoCut = true;
            }
            
            if (r[nIdx]) {
                const tKey = r[nIdx].trim().toLowerCase();
                globalTournamentTiers[tKey] = multiplier;
                globalTournamentTypes[tKey] = { display: eventTypeDisplay, cssClass: safeClass };
                globalTournamentCutRules[tKey] = isNoCut;
            }
            
            let purseObj = null;
            if (purseCols.length > 0) {
                let totalNum = 0;
                let splits = [];
                
                purseCols.forEach(pc => {
                    const valStr = r[pc.index] ? r[pc.index].trim() : '';
                    const num = parseCurrency(valStr);
                    if (valStr !== '') {
                        totalNum += num;
                        splits.push({ pos: pc.pos, valStr, num });
                    }
                });
                
                if (splits.length > 0) {
                    const totalStr = formatCurrency(totalNum);
                    const isWinnerTakeAll = splits.length === 1 && splits[0].pos === 1;
                    
                    const splitText = isWinnerTakeAll ? `WINNER TAKE ALL: ${splits[0].valStr}` : splits.map(s => `${getOrdinal(s.pos)}: ${s.valStr}`).join(' • ');
                    const splitHtml = isWinnerTakeAll ? `WINNER TAKE ALL: ${splits[0].valStr}` : splits.map(s => `${getOrdinal(s.pos)}: ${s.valStr}`).join(' &nbsp;•&nbsp; ');
                    
                    purseObj = { total: totalStr, splitText, splitHtml };
                }
            }
            
            const obj = { name: r[nIdx], course: r[cIdx] || '-', date: rangeStr, purseObj, start, eventTypeDisplay, safeClass };
            if (start <= today) { curr = obj; past.unshift(obj); } else { if (!next) next = obj; upcoming.push(obj); }
        }
        
        document.getElementById('upcoming-list').innerHTML = upcoming.map(t => `<div class="schedule-card"><div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;"><div class="card-date" style="margin-bottom:0;">${t.date}</div><div class="tier-badge ${t.safeClass}">${t.eventTypeDisplay}</div></div><div class="card-name">${t.name}</div><div class="card-course">${t.course}</div>${t.purseObj ? `<div class="card-purse"><div class="card-purse-total">TOTAL: ${t.purseObj.total}</div><div class="card-purse-split">${t.purseObj.splitText}</div></div>` : ''}</div>`).join('');
        document.getElementById('past-tournament-grid').innerHTML = past.map(t => `<div class="schedule-card clickable" onclick="viewArchive('${t.name.replace(/'/g, "\\'")}')"><div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;"><div class="card-date" style="margin-bottom:0;">${t.date}</div><div class="tier-badge ${t.safeClass}">${t.eventTypeDisplay}</div></div><div class="card-name">${t.name}</div><div class="card-course">${t.course}</div>${t.purseObj ? `<div class="card-purse"><div class="card-purse-total">TOTAL: ${t.purseObj.total}</div><div class="card-purse-split">${t.purseObj.splitText}</div></div>` : ''}</div>`).join('');
        
        const currentDay = now.getDay();
        let d = null;
        if (currentDay >= 1 && currentDay <= 3) {
            d = next ? { ...next, label: 'Upcoming Tournament' } : (curr ? { ...curr, label: 'Live Tournament' } : null);
        } else {
            d = curr ? { ...curr, label: 'Live Tournament' } : null;
        }

        if (d && d.name) { 
            activeTournamentStartDate = d.start; 
            activeTournamentKey = d.name.trim().toLowerCase();
            document.getElementById('display-tournament-name').innerText = d.name; 
            document.getElementById('display-banner-label').innerText = d.label; 
            
            const tierEl = document.getElementById('display-banner-tier');
            if (d.eventTypeDisplay) {
                tierEl.innerText = d.eventTypeDisplay;
                tierEl.className = `tier-badge ${d.safeClass}`;
                tierEl.style.display = 'inline-block';
            } else {
                tierEl.style.display = 'none';
            }

            document.getElementById('display-banner-date').innerText = d.date;
            document.getElementById('display-course-name').innerText = d.course;
            
            const purseEl = document.getElementById('display-purse');
            if (d.purseObj) {
                purseEl.innerHTML = `<div class="banner-purse-total">TOTAL PURSE: ${d.purseObj.total}</div><div class="banner-purse-split">${d.purseObj.splitHtml}</div>`;
                purseEl.style.display = 'inline-block';
            } else {
                purseEl.style.display = 'none';
            }
            
            if (document.getElementById('view-live').classList.contains('active') || document.getElementById('view-upcoming').classList.contains('active') || document.getElementById('view-pro').classList.contains('active')) {
                document.getElementById('tournament-banner').style.display = 'block'; 
            }
        }
    } catch (e) {
        console.error("Error fetching schedule:", e);
    }
}

async function fetchUsers() {
    try {
        const rows = parseCSV(await (await fetch(config.usersDataUrl)).text());
        const h = rows[0].map(v => v.toLowerCase().trim());
        const uIdx = findIdx(h, ['username']), uidIdx = findIdx(h, ['user id', 'userid']), gidIdx = findIdx(h, ['golf id', 'golfid']);
        return rows.slice(1).map(r => ({ userId: r[uidIdx].trim(), username: r[uIdx].trim(), originalUsername: r[uIdx].trim(), golfId: gidIdx !== -1 ? r[gidIdx].trim() : '', actualTotalPoints: 0, hasData: false, lineup: [] })).filter(u => u.username && u.userId);
    } catch (e) { return []; }
}

async function initApp() {
    await fetchTournamentSchedule(); 
    try { 
        masterArchiveData = parseCSV(await (await fetch(config.archiveDataUrl)).text()); 
        calculateGlobalRanks(); 
    } catch (e) {}
    await fetchDailyHistoricalData();
    users = await fetchUsers();
    document.getElementById('loading-indicator').style.display = 'none';
    renderLeaderboard(); loadAllUserScores();
}

initApp();
