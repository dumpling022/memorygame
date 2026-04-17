// ----------------------------- 游戏配置 -----------------------------
const ROWS = 3;
const COLS = 4;
const TOTAL_CARDS = 12;
const MATCH_SCORE = 10;
const INIT_TIME = 40; // 40秒倒计时
const BASE_SYMBOLS = ["🍎", "🍌", "🍒", "🍊", "🍉", "🥝"];

// 全局游戏变量
let cards = []; // { id, value, matched }
let currentScore = 0;
let timeLeft = INIT_TIME;
let gameActive = false; // 游戏是否进行中
let timerInterval = null;
let firstCardIndex = null;
let secondCardIndex = null;
let lockBoard = false; // 防止动画中点击
let flipBackTimeout = null;
let isCountdownActive = false; // 是否在3-2-1倒计时中
// 新增 BGM 相关变量
let bgmAudio = null;
let bgmVolume = 0.5; // 背景音乐音量（0-1）
let audioAvailable = true; // 音频不可用/被策略阻止时，自动降级，不影响主流程

// DOM 元素
let boardEl, scoreDisplay, timerDisplay, restartBtn, backHomeFromGame;
let gameEndModal, endMessage, endReturnHomeBtn, endPlayAgainBtn;
let countdownModal, countdownNumber;
let bgmSettingsBtn, bgmSettingsModal, bgmSettingsCloseBtn, bgmSettingsOkBtn;
let bgmVolumeRange, bgmVolumeValue;

// ----------------------------- 辅助函数 -----------------------------
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 生成全新牌组 (6对打乱)
function generateFreshDeck() {
    let deckValues = [...BASE_SYMBOLS, ...BASE_SYMBOLS];
    deckValues = shuffleArray([...deckValues]);
    return deckValues.map((value, idx) => ({ id: idx, value: value, matched: false }));
}

// 重置配对状态
function resetPairingState() {
    if (flipBackTimeout) {
        clearTimeout(flipBackTimeout);
        flipBackTimeout = null;
    }
    firstCardIndex = null;
    secondCardIndex = null;
    lockBoard = false;
}

// 更新UI分数/计时
function updateStatsUI() {
    if (scoreDisplay) scoreDisplay.innerText = currentScore;
    if (timerDisplay) timerDisplay.innerText = timeLeft;
}

// 检查是否全部消除
function isAllCardsMatched() {
    return cards.every((card) => card.matched === true);
}

// 加载下一组牌 (全部消除后刷新)
function loadNextRound() {
    if (!gameActive || isCountdownActive) return false;
    resetPairingState();
    cards = generateFreshDeck();
    renderBoard();
    return true;
}

// 加分并检查是否需要刷新牌堆
function addScoreAndCheckRound(points) {
    currentScore += points;
    updateStatsUI();
    if (isAllCardsMatched() && gameActive && !isCountdownActive && timeLeft > 0) {
        loadNextRound();
    }
}

// 配对成功逻辑
function handleMatch(idxA, idxB) {
    cards[idxA].matched = true;
    cards[idxB].matched = true;
    addScoreAndCheckRound(MATCH_SCORE);
    resetPairingState();
    renderBoard();
}

// 配对失败: 延迟翻回
function handleMismatch(idxA, idxB) {
    lockBoard = true;
    flipBackTimeout = setTimeout(() => {
        firstCardIndex = null;
        secondCardIndex = null;
        lockBoard = false;
        renderBoard();
        if (flipBackTimeout) flipBackTimeout = null;
    }, 300);
    renderBoard();
}

// 卡片点击核心逻辑 (3D翻转由CSS处理，只需改变状态)
function onCardClick(clickedIdx) {
    if (!gameActive || lockBoard || isCountdownActive) return;
    const clickedCard = cards[clickedIdx];
    if (clickedCard.matched) return;

    if (firstCardIndex === null) {
        firstCardIndex = clickedIdx;
        renderBoard();
        return;
    }
    if (firstCardIndex === clickedIdx) return;

    if (secondCardIndex === null) {
        const firstCard = cards[firstCardIndex];
        const secondCard = cards[clickedIdx];
        secondCardIndex = clickedIdx;

        if (firstCard.value === secondCard.value) {
            handleMatch(firstCardIndex, secondCardIndex);
        } else {
            handleMismatch(firstCardIndex, secondCardIndex);
        }
    }
}

// 渲染网格 (基于卡片状态，自动应用 flipped / eliminated 类实现3D翻转和透明消除)
function renderBoard() {
    if (!boardEl) return;
    boardEl.innerHTML = "";
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const isMatched = card.matched;
        // 是否应该显示正面（未被消除且是临时选中的两张之一）
        const isFlipped = !isMatched && (i === firstCardIndex || i === secondCardIndex);

        const cardDiv = document.createElement("div");
        cardDiv.className = "card";
        if (isMatched) cardDiv.classList.add("eliminated");
        if (isFlipped) cardDiv.classList.add("flipped");

        const inner = document.createElement("div");
        inner.className = "card-inner";

        const front = document.createElement("div");
        front.className = "card-front";
        // 正面显示水果图案（未消除时）
        if (!isMatched) {
            front.innerText = card.value;
        } else {
            front.innerText = "";
        }

        const back = document.createElement("div");
        back.className = "card-back";

        inner.appendChild(front);
        inner.appendChild(back);
        cardDiv.appendChild(inner);

        cardDiv.addEventListener(
            "click",
            (function (idx) {
                return function () {
                    onCardClick(idx);
                };
            })(i)
        );

        boardEl.appendChild(cardDiv);
    }
}

// 倒计时启动
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!gameActive || isCountdownActive) return;
        if (timeLeft <= 1) {
            timeLeft = 0;
            updateStatsUI();
            endGame();
        } else {
            timeLeft--;
            updateStatsUI();
        }
    }, 1000);
}

// 游戏结束 (弹出模态框，保存分数)
function endGame() {
    if (!gameActive) return;
    gameActive = false;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    lockBoard = true;
    resetPairingState();

    // 保存分数到 localStorage
    saveScoreToLeaderboard(currentScore);
    renderLeaderboardInStorage();

    // 显示游戏结束模态框
    if (endMessage) endMessage.innerText = `⏰ 游戏结束！ 最终得分: ${currentScore} 分 🎉`;
    if (gameEndModal) gameEndModal.classList.remove("hidden");

    renderBoard(); // 禁止点击效果
}

// 强制停止游戏（用于返回首页，不保存分数）
function forceStopGame() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    if (flipBackTimeout) {
        clearTimeout(flipBackTimeout);
        flipBackTimeout = null;
    }
    gameActive = false;
    lockBoard = true;
    resetPairingState();
}

// ----------------------------- 背景音乐控制 -----------------------------
const BGM_VOLUME_STORAGE_KEY = "fruitMatchBgmVolume";

function clamp01(v) {
    if (Number.isNaN(v)) return 0;
    return Math.min(1, Math.max(0, v));
}

function loadBgmVolume() {
    const raw = localStorage.getItem(BGM_VOLUME_STORAGE_KEY);
    if (raw === null || raw === undefined || raw === "") return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    bgmVolume = clamp01(parsed);
}

function saveBgmVolume() {
    try {
        localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(clamp01(bgmVolume)));
    } catch {
        // 忽略存储异常，不影响游戏主流程
    }
}

function applyBgmVolumeToElement() {
    if (!bgmAudio) return;
    bgmAudio.volume = clamp01(bgmVolume);
    bgmAudio.muted = bgmVolume <= 0;
}

async function safePlayAudio(audioEl) {
    if (!audioEl || !audioAvailable) return;
    try {
        const p = audioEl.play();
        if (p && typeof p.then === "function") await p;
    } catch {
        // 常见原因：自动播放策略、用户未交互、设备/解码异常、资源缺失等
        audioAvailable = false;
    }
}

// 初始化 BGM 音频实例（任何异常都忽略，不影响游戏主流程）
function initBgm() {
    bgmAudio = document.getElementById("bgmAudio");
    if (!bgmAudio) {
        audioAvailable = false;
        return;
    }

    loadBgmVolume();
    applyBgmVolumeToElement();

    bgmAudio.addEventListener("error", () => {
        audioAvailable = false;
    });

    // 只在“用户首次交互”后尝试播放一次，避免策略报错影响控制台/流程
    document.addEventListener(
        "pointerdown",
        () => {
            safePlayAudio(bgmAudio);
        },
        { once: true }
    );
}

// 播放 BGM（带容错）
function playBgm() {
    if (!bgmAudio || !audioAvailable) return;
    applyBgmVolumeToElement();
    if (bgmAudio.paused) safePlayAudio(bgmAudio);
}

// 暂停 BGM
function pauseBgm() {
    if (!bgmAudio) return;
    if (!bgmAudio.paused) {
        bgmAudio.pause();
    }
}

function syncBgmVolumeUI() {
    if (!bgmVolumeRange || !bgmVolumeValue) return;
    const percent = Math.round(clamp01(bgmVolume) * 100);
    bgmVolumeRange.value = String(percent);
    bgmVolumeValue.innerText = `${percent}%`;
}

function setBgmVolumeFromPercent(percent) {
    const p = Number(percent);
    if (!Number.isFinite(p)) return;
    bgmVolume = clamp01(p / 100);
    applyBgmVolumeToElement();
    saveBgmVolume();
    // 尝试播放一次（若被策略阻止会自动降级）
    playBgm();
}

function openBgmSettings() {
    if (!bgmSettingsModal) return;
    syncBgmVolumeUI();
    bgmSettingsModal.classList.remove("hidden");
    // 打开设置也算用户交互，顺便尝试播放（失败自动忽略）
    playBgm();
}

function closeBgmSettings() {
    if (!bgmSettingsModal) return;
    bgmSettingsModal.classList.add("hidden");
}

// ----------------------------- 3-2-1 倒数并开始游戏 -----------------------------
function startGameWithCountdown() {
    // 关闭任何可能存在的模态框
    if (gameEndModal) gameEndModal.classList.add("hidden");
    // 停止所有游戏活动
    forceStopGame();
    // 重置游戏数据
    currentScore = 0;
    timeLeft = INIT_TIME;
    cards = generateFreshDeck();
    firstCardIndex = null;
    secondCardIndex = null;
    lockBoard = false;
    updateStatsUI();
    renderBoard();

    // 开启倒计时模式，禁止交互
    isCountdownActive = true;
    gameActive = false;

    // 显示倒数模态框
    countdownModal.classList.remove("hidden");
    let count = 3;
    countdownNumber.innerText = count;

    const countdownInterval = setInterval(() => {
        count--;
        if (count >= 1) {
            countdownNumber.innerText = count;
        } else {
            clearInterval(countdownInterval);
            countdownModal.classList.add("hidden");
            // 倒数结束，正式激活游戏
            isCountdownActive = false;
            gameActive = true;
            lockBoard = false;
            resetPairingState();
            startTimer();
            renderBoard(); // 确保卡片状态刷新
        }
    }, 1000);
}

// ----------------------------- 排行榜 localStorage -----------------------------
let leaderboardRecords = [];

function loadLeaderboardFromStorage() {
    const stored = localStorage.getItem("fruitMatchLeaderboard");
    if (stored) {
        try {
            leaderboardRecords = JSON.parse(stored);
        } catch (e) {
            leaderboardRecords = [];
        }
    }
    if (!Array.isArray(leaderboardRecords)) leaderboardRecords = [];
    leaderboardRecords.sort((a, b) => b.score - a.score);
    if (leaderboardRecords.length > 10) leaderboardRecords = leaderboardRecords.slice(0, 10);
}

function saveScoreToLeaderboard(score) {
    if (score === undefined || score === null) return;
    loadLeaderboardFromStorage();
    const newRecord = {
        score: score,
        dateStr: new Date().toLocaleString(),
    };
    leaderboardRecords.push(newRecord);
    leaderboardRecords.sort((a, b) => b.score - a.score);
    if (leaderboardRecords.length > 10) leaderboardRecords = leaderboardRecords.slice(0, 10);
    localStorage.setItem("fruitMatchLeaderboard", JSON.stringify(leaderboardRecords));
}

function renderLeaderboardUI() {
    const rankContainer = document.getElementById("rankListContainer");
    if (!rankContainer) return;
    loadLeaderboardFromStorage();
    if (!leaderboardRecords.length) {
        rankContainer.innerHTML = `<div class="text-center text-stone-500 py-8 bg-white/40 rounded-2xl">✨ 暂无数据，快去创造纪录 ✨</div>`;
        return;
    }
    let html = "";
    leaderboardRecords.forEach((entry, idx) => {
        html += `
                    <div class="flex justify-between items-center bg-amber-100/70 rounded-xl px-4 py-2 shadow-sm border border-amber-200">
                        <div class="flex items-center gap-3">
                            <span class="font-bold text-lg ${idx === 0 ? "text-yellow-600" : "text-stone-700"}">#${idx + 1}</span>
                            <span class="text-stone-600 text-sm">${entry.dateStr.slice(0, 16)}</span>
                        </div>
                        <div class="bg-amber-600 text-white font-bold px-4 py-1 rounded-full text-sm">🏅 ${entry.score} 分</div>
                    </div>
                `;
    });
    rankContainer.innerHTML = html;
}

function renderLeaderboardInStorage() {
    loadLeaderboardFromStorage();
    const leaderPanel = document.getElementById("leaderboardPanel");
    if (leaderPanel && !leaderPanel.classList.contains("hidden")) {
        renderLeaderboardUI();
    }
}

// ----------------------------- 单页应用界面切换 -----------------------------
const homePanel = document.getElementById("homePanel");
const gamePanel = document.getElementById("gamePanel");
const leaderboardPanel = document.getElementById("leaderboardPanel");

function showHome() {
    homePanel.classList.remove("hidden");
    gamePanel.classList.add("hidden");
    leaderboardPanel.classList.add("hidden");
    forceStopGame();
    gameActive = false;
    isCountdownActive = false;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    if (gameEndModal) gameEndModal.classList.add("hidden");
    if (countdownModal) countdownModal.classList.add("hidden");

    // 首页 --播放bgm
    playBgm();
}

function showGame() {
    homePanel.classList.add("hidden");
    gamePanel.classList.remove("hidden");
    leaderboardPanel.classList.add("hidden");
    pauseBgm(); //暂停bgm
    startGameWithCountdown(); // 带3-2-1倒数开始
}

function showLeaderboard() {
    homePanel.classList.add("hidden");
    gamePanel.classList.add("hidden");
    leaderboardPanel.classList.remove("hidden");
    forceStopGame();
    gameActive = false;
    isCountdownActive = false;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    if (gameEndModal) gameEndModal.classList.add("hidden");
    if (countdownModal) countdownModal.classList.add("hidden");
    renderLeaderboardUI();
    playBgm();
}

// ----------------------------- 事件绑定 -----------------------------
function bindEvents() {
    document.getElementById("startGameBtn")?.addEventListener("click", () => showGame());
    document.getElementById("viewRankBtn")?.addEventListener("click", () => showLeaderboard());
    document.getElementById("backHomeFromRank")?.addEventListener("click", () => showHome());

    bgmSettingsBtn?.addEventListener("click", () => openBgmSettings());
    bgmSettingsCloseBtn?.addEventListener("click", () => closeBgmSettings());
    bgmSettingsOkBtn?.addEventListener("click", () => closeBgmSettings());

    // 点击遮罩关闭
    bgmSettingsModal?.addEventListener("click", (e) => {
        if (e.target === bgmSettingsModal) closeBgmSettings();
    });

    bgmVolumeRange?.addEventListener("input", (e) => {
        const next = e?.target?.value;
        if (bgmVolumeValue) bgmVolumeValue.innerText = `${next}%`;
        setBgmVolumeFromPercent(next);
    });

    if (backHomeFromGame) {
        backHomeFromGame.addEventListener("click", () => {
            forceStopGame();
            showHome();
        });
    }

    if (restartBtn) {
        restartBtn.addEventListener("click", () => {
            if (!gamePanel.classList.contains("hidden")) {
                forceStopGame();
                isCountdownActive = false;
                if (countdownModal) countdownModal.classList.add("hidden");
                startGameWithCountdown();
            }
        });
    }

    if (endReturnHomeBtn) {
        endReturnHomeBtn.addEventListener("click", () => {
            if (gameEndModal) gameEndModal.classList.add("hidden");
            showHome();
        });
    }
    if (endPlayAgainBtn) {
        endPlayAgainBtn.addEventListener("click", () => {
            if (gameEndModal) gameEndModal.classList.add("hidden");
            if (gamePanel.classList.contains("hidden")) {
                showGame();
            } else {
                startGameWithCountdown();
            }
        });
    }
}

// ----------------------------- 初始化 -----------------------------
function initApp() {
    boardEl = document.getElementById("gameBoard");
    scoreDisplay = document.getElementById("scoreDisplay");
    timerDisplay = document.getElementById("timerDisplay");
    restartBtn = document.getElementById("restartGameBtn");
    backHomeFromGame = document.getElementById("backHomeFromGame");
    gameEndModal = document.getElementById("gameEndModal");
    endMessage = document.getElementById("endMessage");
    endReturnHomeBtn = document.getElementById("endReturnHomeBtn");
    endPlayAgainBtn = document.getElementById("endPlayAgainBtn");
    countdownModal = document.getElementById("countdownModal");
    countdownNumber = document.getElementById("countdownNumber");

    bgmSettingsBtn = document.getElementById("bgmSettingsBtn");
    bgmSettingsModal = document.getElementById("bgmSettingsModal");
    bgmSettingsCloseBtn = document.getElementById("bgmSettingsCloseBtn");
    bgmSettingsOkBtn = document.getElementById("bgmSettingsOkBtn");
    bgmVolumeRange = document.getElementById("bgmVolumeRange");
    bgmVolumeValue = document.getElementById("bgmVolumeValue");

    initBgm(); // 初始化bgm
    bindEvents();
    loadLeaderboardFromStorage();
    renderLeaderboardUI();
    // 预生成一副牌避免报错
    cards = generateFreshDeck();
    if (boardEl) renderBoard();
    showHome(); // 默认显示首页
}

initApp();
