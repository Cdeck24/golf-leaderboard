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
let isAdminAuthenticated = false;

// --- UTILITIES ---
function toggleTheme() {
    const isLight = document.documentElement.classList.toggle('light-mode');
    localStorage.setItem('golfplug_theme', isLight ? 'light' : 'dark');
}

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
function getLineupSignature(lineup) { return (!lineup || lineup.length === 0) ? "" : lineup.map(g => (g.displayName || g.player?.displayName || "").trim()).sort().join('|'); }
function getFormattedDate(base, daysToAdd) { const d = new Date(base); d.setDate(d.getDate() + daysToAdd); return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear(); }

// Robust CSV Parser
function parseCSV(str) {
    const arr = []; let quote = false;
    for (let row = 0, col = 0, c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c+1];
        arr[row] = arr[row] || []; arr[row][col] = arr[row][col] || '';
        if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
        if (cc == '"') { quote = !quote; continue; }
        if (cc == ',' && !quote) { ++col; continue; }
        if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
        if (cc == '\n' && !quote) { ++row; col = 0; continue; }
        if (cc == '\r' && !quote) { ++row; col = 0; continue; }
        arr[row][col] += cc;
    }
    return arr;
}

const findIdx = (h, n) => { for(const name of n) { const i = h.findIndex(x => x.toLowerCase().trim().includes(name.toLowerCase())); if(i !== -1) return i; } return -1; };

function filterLeaderboard() {
    const input = document.getElementById('player-search');
    if (!input) return;
    const filter = input.value.toLowerCase();
    const rows = document.getElementById('leaderboard-tbody').children;
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
            if (nameEl && nameEl.textContent.toLowerCase().includes(filter)) { row.style.display = ''; } 
            else { row.style.display = 'none'; row.classList.remove('open'); }
        } else if (row.classList.contains('draft-row')) {
            if (currentMain && currentMain.style.display === 'none') { row.classList.remove('open'); }
        }
    }
}

// --- DATA FETCHING & SYNC LOGIC ---

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
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--danger);">Failed to load pro leaderboard.</td></tr>';
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

        if (data.cutLine && data.cutLine.index === (index + 1)) {
            rowsHtml.push(`<tr class="cut-line-row"><td colspan="5">${data.cutLine.displayText ? data.cutLine.displayText.toUpperCase() : 'OFFICIAL CUT LINE'}</td></tr>`);
        }
    });

    tbody.innerHTML = rowsHtml.join('');
    statusEl.innerHTML = '<span class="sync-dot"></span>LIVE';
}

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

function renderLeaderboard() {
    const tbody = document.getElementById('leaderboard-tbody');
    if (!tbody) return;
    
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
        let r = { 
            thu: Math.abs(p.dayPieces[0]) > 0.01 ? calculateGolfScore(p.dayPieces[0], pools[0]) : 0, 
            fri: Math.abs(p.dayPieces[1]) > 0.01 ? calculateGolfScore(p.dayPieces[1], pools[1]) : 0, 
            sat: 0, sun: 0 
        };
        const madeCut = isNoCut || ((r.thu + r.fri) <= globalCutScoreFri);
        if (madeCut) { 
            r.sat = Math.abs(p.dayPieces[2]) > 0.01 ? calculateGolfScore(p.dayPieces[2], pools[2]) : 0; 
            r.sun = Math.abs(p.dayPieces[3]) > 0.01 ? calculateGolfScore(p.dayPieces[3], pools[3]) : 0; 
        }
        return { 
            ...p, 
            total: r.thu + r.fri + r.sat + r.sun, 
            today: activeIdx !== -1 ? r[slotKeys[activeIdx]] : 0, 
            rounds: r, 
            actualTotalPoints: (activeIdx !== -1 && p.pts[activeIdx] !== 0) ? p.pts[activeIdx] : (p.hasData ? p.actualTotalPoints : 0), 
            madeCut 
        };
    });

    currentProcessedUsers.sort((a, b) => {
        const aInv = a.isWD || a.isDuplicate || a.syncFailed; 
        const bInv = b.isWD || b.isDuplicate || b.syncFailed;
        if (aInv !== bInv) return aInv ? 1 : -1;
        if (aInv && bInv) return a.isWD ? (b.isWD ? 0 : -1) : 1;
        if (a.madeCut !== b.madeCut) return a.madeCut ? -1 : 1; 
        if (a.total !== b.total) return a.total - b.total;
        return b.actualTotalPoints - a.actualTotalPoints;
    });

    const validField = currentProcessedUsers.filter(x => !x.isWD && !x.isDuplicate && !x.syncFailed);
    const isFinalDay = activeIdx === 3 || activeIdx === -1; 
    let vfIdx = 0;
    
    while (vfIdx < validField.length) {
        let j = vfIdx; 
        while (j < validField.length && validField[j].total === validField[vfIdx].total && validField[j].madeCut === validField[vfIdx].madeCut) j++;
        if (vfIdx === 0 && isFinalDay) { 
            validField[0].displayPos = "1"; 
            for (let k = 1; k < j; k++) validField[k].displayPos = "T2"; 
        } else { 
            for (let k = vfIdx; k < j; k++) validField[k].displayPos = (j - vfIdx) > 1 ? 'T' + (vfIdx + 1) : (vfIdx + 1).toString(); 
        }
        vfIdx = j;
    }

    tbody.innerHTML = ''; 
    let cutLineInserted = false;
    
    currentProcessedUsers.forEach(u => {
        if (!isNoCut && !cutLineInserted && !u.madeCut && !u.isWD && !u.isDuplicate && !u.syncFailed) { 
            tbody.innerHTML += `<tr class="cut-line-row"><td colspan="4">${activeIdx < 2 ? 'EXPECTED CUT LINE' : 'OFFICIAL CUT LINE'} (${formatToPar(globalCutScoreFri)})</td></tr>`; 
            cutLineInserted = true; 
        }
        
        const tag = u.isDuplicate ? '(DUP)' : (u.syncFailed ? '(ERR)' : (activeIdx >= 2 && !u.madeCut ? '(MC)' : ''));
        const pos = (u.isWD) ? 'WD' : (u.isDuplicate) ? 'DUP' : (u.syncFailed ? 'ERR' : (u.hasData ? u.displayPos : '-'));
        const userRank = globalSeasonRanks[u.userId.toLowerCase()] || globalSeasonRanks[u.username.toLowerCase()];
        
        let rankBadge = '';
        if (userRank) {
            if (userRank === 1) rankBadge = `<span class="season-rank-badge rank-1" title="Season Rank 1">👑 #1</span>`;
            else if (userRank === 2) rankBadge = `<span class="season-rank-badge rank-2" title="Season Rank 2">🥈 #2</span>`;
            else if (userRank === 3) rankBadge = `<span class="season-rank-badge rank-3" title="Season Rank 3">🥉 #3</span>`;
            else if (userRank <= 10) rankBadge = `<span class="season-rank-badge rank-top10" title="Top 10 Season Rank">⭐ #${userRank}</span>`;
            else rankBadge = `<span class="season-rank-badge" title="Season Rank">#${userRank}</span>`;
        }
        
        const mainRow = document.createElement('tr'); 
        mainRow.className = 'main-row';
        mainRow.innerHTML = `<td class="col-pos">${pos}</td><td class="col-player"><div class="player-flex">${rankBadge}<span class="p-name">${formatHandle(u.username)}</span>${tag ? `<span class="p-tag">${tag}</span>` : ''}<span class="toggle-icon">▼</span></div></td><td class="col-score">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':formatToPar(u.total)}</td><td class="col-score">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':formatToPar(u.today)}</td>`;
        
        const dr = document.createElement('tr'); 
        dr.className = 'draft-row';
        const s = (val) => (val === 0 ? 0 : val).toFixed(2);
        dr.innerHTML = `<td colspan="4"><div class="expanded-container"><div class="round-breakdown"><div class="round-slot"><span class="round-label">Thu</span><span class="round-val">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':formatToPar(u.rounds.thu)}</span><span class="round-piece">${s(u.dayPieces[0])} PTS</span></div><div class="round-slot"><span class="round-label">Fri</span><span class="round-val">${(u.isWD||u.isDuplicate||u.syncFailed)?'-':formatToPar(u.rounds.fri)}</span><span class="round-piece">${s(u.dayPieces[1])} PTS</span></div><div class="round-slot"><span class="round-label">Sat</span><span class="round-val">${u.madeCut?formatToPar(u.rounds.sat):'<span class="score-box mc">MC</span>'}</span><span class="round-piece">${s(u.dayPieces[2])} PTS</span></div><div class="round-slot"><span class="round-label">Sun</span><span class="round-val">${u.madeCut?formatToPar(u.rounds.sun):'<span class="score-box mc">MC</span>'}</span><span class="round-piece">${s(u.dayPieces[3])} PTS</span></div></div><div class="raw-pts-display">Total Raw Score: ${u.actualTotalPoints.toFixed(2)}</div><div class="draft-grid"></div></div></td>`;
        
        mainRow.onclick = () => { 
            const o = mainRow.classList.contains('open'); 
            tbody.querySelectorAll('.main-row, .draft-row').forEach(r => r.classList.remove('open')); 
            if (!o) { 
                mainRow.classList.add('open'); 
                dr.classList.add('open'); 
                renderDraft(u, dr.querySelector('.draft-grid')); 
            } 
        };
        tbody.appendChild(mainRow); tbody.appendChild(dr);
    });
    
    filterLeaderboard();
}

function renderDraft(u, c) {
    if (u.syncFailed) { c.innerHTML = '<div style="width:100%; text-align:center; font-size:0.8rem; color:var(--text-muted);">Failed to sync from API.</div>'; return; }
    if (!u.hasData) { c.innerHTML = '<div style="width:100%; text-align:center; font-size:0.8rem;">Loading...</div>'; return; }
    if (u.isWD) { c.innerHTML = '<div style="width:100%; text-align:center; font-size:0.8rem; color:var(--danger); font-weight: 800;">WITHDRAWN</div>'; return; }
    c.innerHTML = (u.isDuplicate ? '<div style="width:100%; color:var(--danger); font-size:0.8rem; text-align:center; font-weight:800; margin-bottom:10px;">DUPLICATE LINEUP (0 PTS)</div>' : '') + 
        u.lineup.map(g => `<div class="draft-item"><img src="${g.avatar||g.player?.avatar ? `https://media.realapp.link/assets/players/default/large/${g.avatar||g.player.avatar}.webp` : 'https://placehold.co/40x40/eee/333?text=?'}" class="draft-item-avatar" onerror="this.src='https://placehold.co/40x40/eee/333?text=?'"><span class="draft-item-name">${g.displayName||g.player?.displayName||'Unknown'}</span><span class="draft-item-score">${(parseFloat(g.score)||0).toFixed(2)}</span></div>`).join('');
}

// --- RANKINGS ENGINE ---

function getSeasonPoints(pos, status, mult = 1) {
    if (status === "WD" || status === "DUP" || !pos) return 0;
    const p = parseInt(String(pos).replace(/\D/g, '')); if (isNaN(p)) return 0;
    let b = 0;
    if (p===1) b=100; else if (p===2) b=60; else if (p===3) b=45; else if (p===4) b=35; else if (p===5) b=30;
    else if (p===6) b=25; else if (p===7) b=22; else if (p===8) b=20; else if (p===9) b=18; else if (p===10) b=16;
    else if (p>=11 && p<=20) b = 14 - (p - 11); else if (p>=21) b = status == "MADE CUT" ? 3 : 2;
    return Math.round(b * mult);
}

function getProcessedTournaments() {
    if (processedTournamentsCache) return processedTournamentsCache;
    const h = masterArchiveData[0].map(v => v.toLowerCase().trim());
    const [tIdx, uIdx, uidIdx, sIdx, epIdx] = ['tournament', 'username', 'user id', 'status', 'event type'].map(k => findIdx(h, [k]));
    const tournaments = {};
    
    masterArchiveData.slice(1).forEach(r => {
        const tName = r[tIdx]; if (!tName) return;
        const tk = tName.trim().toLowerCase();
        let m = globalTournamentTiers[tk] || 1.0;
        if (epIdx !== -1 && r[epIdx]) { const v = r[epIdx].toLowerCase(); if (v.includes('major')||v.includes('players')) m=1.5; else if (v.includes('signature')) m=1.4; else if (v.includes('regular')) m=1.0; }
        if (!tournaments[tName]) tournaments[tName] = [];
        tournaments[tName].push({ r, username: r[uIdx]?.trim(), userId: uidIdx !== -1 ? r[uidIdx]?.trim() : null, totalGolf: parseInt(r[4]) || 0, totalRaw: parseFloat(r[9]) || 0, madeCut: globalTournamentCutRules[tk] ? true : r[sIdx]?.toUpperCase() === "MADE CUT", status: r[sIdx]?.toUpperCase(), rounds: { thu: r[5], fri: r[6], sat: r[7], sun: r[8] }, pieces: { thu: parseFloat(r[10])||0, fri: (parseFloat(r[11])||0)-(parseFloat(r[10])||0), sat: (parseFloat(r[12])||0)-(parseFloat(r[11])||0), sun: (parseFloat(r[13])||0)-(parseFloat(r[12])||0) }, multiplier: m });
    });
    
    Object.keys(tournaments).forEach(t => {
        const f = tournaments[t];
        f.sort((a,b) => { const aInv = a.status==="WD"||a.status==="DUP"; const bInv = b.status==="WD"||b.status==="DUP"; if (aInv !== bInv) return aInv ? 1 : -1; if (a.madeCut !== b.madeCut) return a.madeCut ? -1 : 1; if (a.totalGolf !== b.totalGolf) return a.totalGolf - b.totalGolf; return b.totalRaw - a.totalRaw; });
        const v = f.filter(x => x.status !== "WD" && x.status !== "DUP");
        let i = 0; 
        while (i < v.length) { 
            let j = i; while (j < v.length && v[j].totalGolf === v[i].totalGolf && v[j].madeCut === v[i].madeCut) j++; 
            if (i===0) { v[0].displayPos = "1"; for (let k=1; k<j; k++) v[k].displayPos = "T2"; } 
            else { for (let k=i; k<j; k++) v[k].displayPos = (j-i)>1 ? 'T'+(i+1) : (i+1).toString(); } 
            i=j; 
        }
    });
    return processedTournamentsCache = tournaments;
}

function calculateGlobalRanks() {
    const t = getProcessedTournaments(); const stats = {};
    Object.keys(t).forEach(tn => t[tn].forEach(p => {
        if (!p.username) return; const k = p.userId ? p.userId.toLowerCase().trim() : p.username.toLowerCase().trim();
        if (!stats[k]) stats[k] = { points: 0, wins: 0, starts: 0, uid: p.userId, username: p.username, history: [] };
        if (p.status !== "WD" && p.status !== "DUP") { 
            stats[k].starts++; 
            const e = getSeasonPoints(p.displayPos, p.status, p.multiplier); 
            stats[k].points += e; 
            if (p.displayPos === "1" && p.status === "MADE CUT") stats[k].wins++; 
            stats[k].history.push({ name: tn, pos: p.displayPos, points: e }); 
        }
    }));
    Object.values(stats).forEach(s => { if (s.uid) { const lu = users.find(u => u.userId && u.userId.toLowerCase() === s.uid.toLowerCase()); if (lu && lu.username) s.username = lu.username; } });
    globalSeasonStatsArray = Object.values(stats).sort((a,b) => b.points - a.points || b.wins - a.wins || b.starts - a.starts);
    globalSeasonRanks = {}; globalSeasonStatsArray.forEach((p, i) => { if (p.username) globalSeasonRanks[p.username.toLowerCase()] = i+1; if (p.uid) globalSeasonRanks[p.uid.toLowerCase()] = i+1; });
}

function renderRankings() {
    const tb = document.getElementById('rankings-tbody'); if (!tb || globalSeasonStatsArray.length === 0) return; tb.innerHTML = '';
    globalSeasonStatsArray.forEach((p, i) => {
        const r = document.createElement('tr'); r.className = 'main-row';
        r.innerHTML = `<td class="col-pos">${i+1}</td><td class="col-player"><div class="player-flex"><span class="p-name">${formatHandle(p.username)}</span><span class="toggle-icon">▼</span></div></td><td class="col-stat">${p.points}</td><td class="col-stat">${p.wins}</td><td class="col-stat">${p.starts}</td>`;
        const dr = document.createElement('tr'); dr.className = 'draft-row';
        dr.innerHTML = `<td colspan="5"><div class="expanded-container"><div style="font-size:0.7rem; font-weight:800; color:var(--text-muted); margin-bottom:8px;">HISTORY</div>${p.history.map(h => `<div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px; border-bottom:1px solid var(--glass-border); padding-bottom:4px;"><span>${h.name}</span><span>Pos: <strong>${h.pos}</strong> <span style="color:var(--golf-green-mid); margin-left:10px;">+${h.points}</span></span></div>`).join('')}</div></td>`;
        r.onclick = () => { const o = r.classList.contains('open'); tb.querySelectorAll('.main-row, .draft-row').forEach(x => x.classList.remove('open')); if (!o) { r.classList.add('open'); dr.classList.add('open'); } };
        tb.appendChild(r); tb.appendChild(dr);
    });
}

function viewArchive(name) {
    const t = getProcessedTournaments()[name]; if (!t) return;
    const tb = document.getElementById('archive-tbody'); const cd = document.getElementById('archive-champ-display');
    const tt = globalTournamentTypes[name.toLowerCase()] || { display: 'REGULAR', cssClass: 'regular' };
    
    document.getElementById('archive-header-title').innerHTML = `<div style="display:flex; align-items:center; gap:8px;">${name.toUpperCase()} <span class="tier-badge ${tt.cssClass}">${tt.display}</span></div>`;
    
    const v = t.filter(x => x.status !== "WD" && x.status !== "DUP");
    if (v.length > 0) {
        const w = v[0]; let wn = w.username;
        if (w.userId) { const lu = users.find(u => u.userId.toLowerCase() === w.userId.toLowerCase()); if (lu && lu.username) wn = lu.username; }
        cd.innerHTML = `<div class="champion-spotlight"><div class="champ-label">Champion</div><div class="champ-name">🏆 ${formatHandle(wn)}</div><div class="champ-score">${w.totalGolf===0?'E':(w.totalGolf>0?'+'+w.totalGolf:w.totalGolf)} (${w.totalRaw.toFixed(2)} PTS)</div></div>`;
    } else cd.innerHTML = '';
    
    tb.innerHTML = ''; let cutIn = false;
    t.forEach(i => {
        const isInv = i.status === "WD" || i.status === "DUP";
        if (!cutIn && !i.madeCut && !isInv) { tb.innerHTML += `<tr class="cut-line-row"><td colspan="4">OFFICIAL CUT LINE</td></tr>`; cutIn = true; }
        let du = i.username; if (i.userId) { const lu = users.find(u => u.userId.toLowerCase() === i.userId.toLowerCase()); if (lu && lu.username) du = lu.username; }
        
        const mr = document.createElement('tr'); mr.className = 'main-row';
        mr.innerHTML = `<td class="col-pos">${isInv?i.status:i.displayPos}</td><td class="col-player"><div class="player-flex"><span class="p-name">${formatHandle(du)}</span><span class="toggle-icon">▼</span></div></td><td class="col-score">${isInv?'-':formatToPar(i.totalGolf)}</td><td class="col-score">${i.totalRaw.toFixed(2)}</td>`;
        
        const dr = document.createElement('tr'); dr.className = 'draft-row';
        const s = (val) => (val === 0 ? 0 : val).toFixed(2);
        dr.innerHTML = `<td colspan="4"><div class="expanded-container"><div class="round-breakdown"><div class="round-slot"><span class="round-label">Thu</span><span class="round-val">${isInv?'-':formatToPar(i.rounds.thu)}</span><span class="round-piece">${isInv?'-':s(i.pieces.thu)} PTS</span></div><div class="round-slot"><span class="round-label">Fri</span><span class="round-val">${isInv?'-':formatToPar(i.rounds.fri)}</span><span class="round-piece">${isInv?'-':s(i.pieces.fri)} PTS</span></div><div class="round-slot"><span class="round-label">Sat</span><span class="round-val">${i.madeCut?formatToPar(i.rounds.sat):'<span class="score-box mc">MC</span>'}</span><span class="round-piece">${isInv?'-':s(i.pieces.sat)} PTS</span></div><div class="round-slot"><span class="round-label">Sun</span><span class="round-val">${i.madeCut?formatToPar(i.rounds.sun):'<span class="score-box mc">MC</span>'}</span><span class="round-piece">${isInv?'-':s(i.pieces.sun)} PTS</span></div></div></div></td>`;
        
        mr.onclick = () => { const o = mr.classList.contains('open'); tb.querySelectorAll('.main-row, .draft-row').forEach(r => r.classList.remove('open')); if (!o) { mr.classList.add('open'); dr.classList.add('open'); } };
        tb.appendChild(mr); tb.appendChild(dr);
    });
    
    document.getElementById('past-tournament-grid').style.display = 'none'; 
    document.getElementById('archive-viewer').style.display = 'block';
}

// --- ADMIN EXPORTS ---

function generateCSV(rows, filename) {
    const blob = new Blob([rows.map(e => e.join(",")).join("\n")], { type: 'text/csv' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename; link.click();
}

function exportScoresToCSV() {
    const rows = [["position", "username", "user id", "status", "total_golf", "thu_golf", "fri_golf", "sat_golf", "sun_golf", "total_raw", "thu_raw", "fri_raw", "sat_raw", "sun_raw"]];
    currentProcessedUsers.forEach((u) => { 
        if(u.hasData) {
            let status = u.madeCut ? "MADE CUT" : "MISSED CUT"; if (u.isWD) status = "WD"; else if (u.isDuplicate) status = "DUP";
            rows.push([ u.isWD?'WD':(u.isDuplicate?'DUP':(u.syncFailed?'ERR':u.displayPos)), u.username, u.userId, status, u.total, u.rounds.thu, u.rounds.fri, u.rounds.sat, u.rounds.sun, u.actualTotalPoints.toFixed(2), u.pts[0].toFixed(2), u.pts[1].toFixed(2), u.pts[2].toFixed(2), u.pts[3].toFixed(2) ]); 
        }
    });
    generateCSV(rows, `golf_plug_full_records.csv`); document.getElementById('export-menu').style.display = 'none';
}

function exportDay(dayName) {
    const map = { thursday: 0, friday: 1, saturday: 2, sunday: 3 }; const tIdx = map[dayName]; if (tIdx === undefined) return;
    const tDates = []; for (let i = 0; i < 4; i++) tDates.push(getFormattedDate(activeTournamentStartDate, i));
    const todayStr = (getNow().getMonth() + 1) + '/' + getNow().getDate() + '/' + getNow().getFullYear();
    const rows = [["username", "user id", "raw points", "golf score", "date"]];
    
    const daysToExport = [];
    for (let i = 0; i <= tIdx; i++) { if (i === tIdx || !Object.values(historicalDailyDataByDate).some(h => h[tDates[i]] !== undefined)) daysToExport.push(i); }

    daysToExport.forEach(dIdx => {
        const tempPool = [];
        const tempU = users.map(u => {
            const pts = getInterpolatedPts(u, tDates, todayStr);
            let dp = pts[dIdx] - (dIdx > 0 ? pts[dIdx - 1] : 0); if (Math.abs(dp) < 0.01) dp = 0;
            return { u, live: pts[dIdx], dp, sig: getLineupSignature(u.lineup) };
        });
        
        const refSigsLocal = [];
        tempU.forEach(x => { if (REFERENCE_IDS.includes(x.u.userId.toLowerCase().trim()) && x.sig) refSigsLocal.push(x.sig); });
        
        tempU.forEach(x => {
            x.isDup = !REFERENCE_IDS.includes(x.u.userId.toLowerCase().trim()) && x.sig !== "" && refSigsLocal.includes(x.sig);
            if (!x.isDup && Math.abs(x.dp) > 0.01) tempPool.push(x.dp);
        });
        
        tempU.forEach(x => {
            if (x.u.hasData) rows.push([x.u.username, x.u.userId, x.live.toFixed(2), (!x.isDup && Math.abs(x.dp)>0.01) ? calculateGolfScore(x.dp, tempPool) : 0, tDates[dIdx]]);
        });
    });
    generateCSV(rows, `golf_plug_${dayName}_${tDates[tIdx].replace(/\//g, '-')}.csv`); document.getElementById('export-menu').style.display = 'none';
}

function exportWDsToCSV() {
    const rows = [["username", "user id"]];
    users.forEach(u => { if (u.hasData && !u.syncFailed && (!u.lineup || u.lineup.length === 0)) rows.push([u.username, u.userId]); });
    generateCSV(rows, `golf_plug_withdrawals.csv`); document.getElementById('export-menu').style.display = 'none';
}

function exportNameUpdatesToCSV() {
    const rows = [["username", "user id"]]; users.forEach(u => rows.push([u.username, u.userId]));
    generateCSV(rows, `golf_plug_usernames.csv`); document.getElementById('export-menu').style.display = 'none';
}

// --- BOOTSTRAP & SYNCING ---

async function fetchDailyHistoricalData() {
    try {
        const res = await fetch(config.dailyDataUrl);
        const rows = parseCSV(await res.text());
        const h = rows[0].map(v => v.toLowerCase().trim());
        const uIdx = findIdx(h, ['user id', 'userid']), dIdx = findIdx(h, ['date']), rIdx = findIdx(h, ['raw points']), gIdx = findIdx(h, ['golf score']);
        if (uIdx === -1 || dIdx === -1) return;
        
        rows.slice(1).forEach(r => {
            const uid = r[uIdx]?.trim().toLowerCase(); const date = r[dIdx]?.trim();
            if (!uid || !date) return;
            if (!historicalDailyDataByDate[uid]) historicalDailyDataByDate[uid] = {};
            historicalDailyDataByDate[uid][date] = { score: parseFloat(r[gIdx]) || 0, raw: parseFloat(r[rIdx]) || 0 };
        });
    } catch (e) {
        console.error("Failed to load historical daily data", e);
    }
}

async function fetchTournamentSchedule() {
    try {
        const res = await fetch(config.scheduleUrl); 
        const rows = parseCSV(await res.text());
        const now = getNow(); 
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const h = rows[0].map(v => v.toLowerCase().trim());
        const [dIdx, nIdx, cIdx, etIdx, cutIdx] = ['date', 'tournament', 'course', 'event type', 'cut'].map(k => findIdx(h, [k]));
        
        const pCols = []; h.forEach((c, i) => { const m = c.match(/^purse\s+(\d+)$/); if (m) pCols.push({ index: i, pos: parseInt(m[1], 10) }); }); pCols.sort((a, b) => a.pos - b.pos);
        const getOrd = (n) => { const s = ["TH", "ST", "ND", "RD"]; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
        const pCurr = (str) => { let m = 1; if (str.toLowerCase().includes('k')) m = 1000; if (str.toLowerCase().includes('m')) m = 1000000; return (parseFloat(str.replace(/[^0-9.-]+/g, "")) || 0) * m; };
        
        const upc = [], pst = []; let curr = null, nxt = null;
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i]; const p = (r[dIdx] || '').split('/'); if (p.length < 2) continue;
            const start = new Date(today.getFullYear(), parseInt(p[0]) - 1, parseInt(p[1]));
            const end = new Date(start); end.setDate(end.getDate() + 3);
            
            let mult = 1.0; let etDisp = 'REGULAR'; let safeCls = 'regular'; let noCut = false;
            if (etIdx !== -1 && r[etIdx]) { const v = r[etIdx].toLowerCase(); if (v.includes('major')||v.includes('players')) { mult=1.5; safeCls='major'; } else if (v.includes('signature')) { mult=1.4; safeCls='signature'; } etDisp = r[etIdx].toUpperCase(); if (v.includes('no cut')) noCut = true; }
            if (cutIdx !== -1 && r[cutIdx] && ['no cut', 'no', 'false'].includes(r[cutIdx].toLowerCase().trim())) noCut = true;
            if (r[nIdx]) { const tk = r[nIdx].trim().toLowerCase(); globalTournamentTiers[tk] = mult; globalTournamentTypes[tk] = { display: etDisp, cssClass: safeCls }; globalTournamentCutRules[tk] = noCut; }
            
            let pObj = null;
            if (pCols.length > 0) {
                let tNum = 0; let spl = [];
                pCols.forEach(pc => { const vStr = r[pc.index] ? r[pc.index].trim() : ''; const num = pCurr(vStr); if (vStr !== '') { tNum += num; spl.push({ pos: pc.pos, vStr, num }); } });
                if (spl.length > 0) pObj = { total: tNum.toLocaleString('en-US') + ' RAX', sText: spl.length===1&&spl[0].pos===1 ? `WINNER TAKE ALL: ${spl[0].vStr}` : spl.map(s => `${getOrd(s.pos)}: ${s.vStr}`).join(' • ') };
            }
            
            const obj = { name: r[nIdx], course: r[cIdx] || '-', date: `${start.getMonth()+1}/${start.getDate()} - ${end.getMonth()+1}/${end.getDate()}`, pObj, start, etDisp, safeCls };
            if (start <= today) { curr = obj; pst.unshift(obj); } else { if (!nxt) nxt = obj; upc.push(obj); }
        }
        
        const cTmpl = (t) => `<div class="schedule-card ${t.start <= today ? 'clickable' : ''}" ${t.start <= today ? `onclick="viewArchive('${t.name}')"` : ''}><div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;"><div class="card-date">${t.date}</div><div class="tier-badge ${t.safeCls}">${t.etDisp}</div></div><div class="card-name">${t.name}</div><div class="card-course">${t.course}</div>${t.pObj ? `<div class="card-purse"><div class="card-purse-total">${t.pObj.total}</div><div class="card-purse-split">${t.pObj.sText}</div></div>` : ''}</div>`;
        document.getElementById('upcoming-list').innerHTML = upc.map(cTmpl).join('');
        document.getElementById('past-tournament-grid').innerHTML = pst.map(cTmpl).join('');
        
        let d = (now.getDay() >= 1 && now.getDay() <= 3) ? (nxt ? {...nxt, label: 'Upcoming'} : (curr ? {...curr, label: 'Live'} : null)) : (curr ? {...curr, label: 'Live'} : null);
        if (d && d.name) { 
            activeTournamentStartDate = d.start; activeTournamentKey = d.name.trim().toLowerCase();
            document.getElementById('display-tournament-name').innerText = d.name; document.getElementById('display-banner-label').innerText = d.label; 
            const tEl = document.getElementById('display-banner-tier'); if (d.etDisp) { tEl.innerText = d.etDisp; tEl.className = `tier-badge ${d.safeCls}`; tEl.style.display = 'inline-block'; } else tEl.style.display = 'none';
            document.getElementById('display-banner-date').innerText = d.date; document.getElementById('display-course-name').innerText = d.course;
            const pEl = document.getElementById('display-purse'); if (d.pObj) { pEl.innerHTML = `<div class="banner-purse-total">${d.pObj.total}</div><div class="banner-purse-split">${d.pObj.sText.replace(/ • /g, ' &nbsp;•&nbsp; ')}</div>`; pEl.style.display = 'inline-block'; } else pEl.style.display = 'none';
            document.getElementById('tournament-banner').style.display = 'block'; 
        }
    } catch (e) {
        console.error("Failed to load schedule", e);
    }
}

async function fetchUsers() {
    try {
        const res = await fetch(config.usersDataUrl); const rows = parseCSV(await res.text());
        const h = rows[0].map(v => v.toLowerCase().trim());
        const uIdx = findIdx(h, ['username']), uidIdx = findIdx(h, ['user id', 'userid']), gidIdx = findIdx(h, ['golf id', 'golfid']);
        return rows.slice(1).map(r => ({ userId: r[uidIdx].trim(), username: r[uIdx].trim(), originalUsername: r[uIdx].trim(), golfId: gidIdx !== -1 ? r[gidIdx].trim() : '', actualTotalPoints: 0, hasData: false, lineup: [] })).filter(u => u.username && u.userId);
    } catch (e) { 
        console.error("Failed to load users", e);
        return []; 
    }
}

async function loadAllUserScores() {
    users.forEach(u => { if (!u.golfId) { u.hasData = true; u.syncFailed = false; u.lineup = []; } });
    const vUsers = [...users].filter(u => u.golfId && u.userId);
    vUsers.forEach(u => { u.retries = 0; u.syncFailed = false; });
    
    let q = [...vUsers]; let loaded = 0; 
    const statusEl = document.getElementById('sync-status');
    const hasher = new Hashids("realwebapp", 16);
    let nextReq = Date.now(); let pace = 200; let globalPause = 0;
    
    async function syncWorker() {
        while (q.length > 0) {
            const u = q.shift(); if (!u) break;
            if (Date.now() < globalPause) { await new Promise(r => setTimeout(r, 100)); q.unshift(u); continue; }
            
            const now = Date.now(); let d = 0;
            if (nextReq > now) { d = nextReq - now; nextReq += pace; } else nextReq = now + pace;
            if (d > 0) await new Promise(r => setTimeout(r, d));

            try {
                const opts = { headers: { 'real-auth-info': config.REAL_AUTH_TOKEN, 'real-device-name': 'Chrome', 'real-device-type': 'desktop_web', 'real-device-uuid': DEVICE_UUID, 'real-request-token': hasher.encode(Date.now()), 'real-version': config.REAL_VERSION } };
                const res = await fetch(`${config.workerProxy}?url=${encodeURIComponent(`https://web.realsports.io/games/playerratingcontest/${u.golfId}/view/${u.userId}?contestType=sport&source=home`)}`, opts);
                
                if (res.status === 429 || res.status === 502) {
                    globalPause = Date.now() + 1200; nextReq = Date.now() + 1200; pace = Math.min(pace + 50, 1000);
                    u.retries++; if (u.retries < 10) q.unshift(u); else { u.hasData = true; u.syncFailed = true; loaded++; }
                } else if (res.ok) {
                    pace = Math.max(pace - 2, 125); const data = await res.json();
                    if (!currentGameId && data.lineup && data.lineup.length > 0) { currentGameId = String(data.lineup[0].matchId || data.lineup[0].gameId); fetchProLeaderboard(); }
                    
                    let foundName = null; const tid = String(u.userId).toLowerCase();
                    function ds(obj) {
                        if (foundName || !obj || typeof obj !== 'object') return;
                        if (obj.id !== undefined && String(obj.id).toLowerCase() === tid) foundName = obj.username || obj.userName;
                        if (!foundName && obj.username && (String(obj.userId).toLowerCase() === tid || String(obj.ownerId).toLowerCase() === tid)) foundName = obj.username;
                        if (!foundName) Object.values(obj).forEach(v => ds(v));
                    }
                    ds(data);
                    
                    if (!foundName) {
                        const n2 = Date.now(); let d2 = 0; if (nextReq > n2) { d2 = nextReq - n2; nextReq += pace; } else nextReq = n2 + pace;
                        if (d2 > 0) await new Promise(r => setTimeout(r, d2));
                        try { const pRes = await fetch(`${config.workerProxy}?url=${encodeURIComponent(`https://web.realsports.io/users/${u.userId}`)}`, opts); if (pRes.ok) { const pData = await pRes.json(); if (pData.username) foundName = pData.username; } } catch(e){}
                    }
                    if (foundName) u.username = foundName.trim();
                    
                    u.actualTotalPoints = parseFloat((data.info?.rankDisplayInfos?.[0]?.scoreDisplay || '0').replace(/[^0-9.]/g, '')) || 0;
                    u.lineup = data.lineup || [];
                    u.lineup.forEach(g => { const p = g.player || {}; const pid = String(g.playerId || p.id || g.id); if (pid && pid !== 'undefined') globalPlayers[pid] = { displayName: p.displayName || g.displayName, lastName: p.lastName || g.lastName, firstName: p.firstName || g.firstName, avatar: p.avatar || g.avatar, id: pid, value: g.score, pickCount: (globalPlayers[pid]?.pickCount || 0) + 1 }; });
                    u.actualTodayPoints = u.lineup.reduce((acc, g) => acc + (parseFloat(g.score) || 0), 0);
                    u.hasData = true; loaded++;
                } else { if (res.status === 404) { u.hasData = true; u.syncFailed = true; loaded++; } else { u.retries++; if (u.retries < 10) q.push(u); else { u.hasData = true; u.syncFailed = true; loaded++; } } }
            } catch (e) { globalPause = Date.now() + 1000; nextReq = Date.now() + 1000; u.retries++; if (u.retries < 10) q.unshift(u); else { u.hasData = true; u.syncFailed = true; loaded++; } }
            
            statusEl.innerHTML = `<span class="sync-dot"></span>${loaded}/${vUsers.length}`;
            if (loaded % 8 === 0 || q.length === 0) { renderLeaderboard(); renderProLeaderboard(); }
            await new Promise(r => setTimeout(r, 25));
        }
    }

    const wkrs = []; for (let i = 0; i < 6; i++) wkrs.push(syncWorker());
    await Promise.all(wkrs);
    
    calculateGlobalRanks(); 
    renderLeaderboard(); 
    renderProLeaderboard();
    if (document.getElementById('view-rankings').classList.contains('active')) renderRankings();
    statusEl.innerHTML = '<span class="sync-dot"></span>LIVE';
}

async function initApp() {
    await fetchTournamentSchedule(); 
    
    try { 
        masterArchiveData = parseCSV(await (await fetch(config.archiveDataUrl)).text()); 
        calculateGlobalRanks(); 
    } catch (e) { console.warn("Could not load archive data", e); }
    
    await fetchDailyHistoricalData(); 
    users = await fetchUsers();
    
    // Hide the loader and start sync!
    document.getElementById('loading-indicator').style.display = 'none';
    
    renderLeaderboard(); 
    loadAllUserScores();
}

// Start the engine
initApp();
