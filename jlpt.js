pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let appData = null;
let currentExam = null;

const SECTION_KEYS = ['moji_goi', 'bunpou', 'choukai'];
let currentSectionIndex = 0; 
let isPracticeMode = false; // Mặc định Thi thử

let pdfCache = {}; 
let masterPdfDoc = null;
let currentPdfUrl = '';
let currentPdfPage = 1;
let currentPdfScale = 1.2;
let currentRenderTask = null;

let sectionTimerInterval = null;
let sectionTimeRemaining = 0;

let currentSession = {
    answers: { moji_goi: {}, bunpou: {}, choukai: {} },
    flagged: { moji_goi: {}, bunpou: {}, choukai: {} },
    graded: { moji_goi: false, bunpou: false, choukai: false },
    scores: { moji_goi: null, bunpou: null, choukai: null }
};

const audioPlayer = document.getElementById('choukai-player');
const playAudioBtn = document.getElementById('btn-play-audio');

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // Kiểm tra cả Android và iOS (iPhone, iPad, iPod)
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.body.classList.add('is-mobile');
    }
    try {
        const res = await fetch('data/jlpt_data.json');
        appData = await res.json();

        setupExamInfo();
        startCountdown();

        renderHomeExamsGrid();
        renderHistoryTable();

        initEventListeners();
    } catch (err) {
        console.error("Lỗi khi nạp dữ liệu JSON:", err);
    }
}

function setupExamInfo() {
    if (!appData.exam_info) return;
    const info = appData.exam_info;
    document.getElementById('exam-title').textContent = info.next_exam_name;
    document.getElementById('exam-date').textContent = new Date(info.next_exam_date).toLocaleDateString('vi-VN');
    document.getElementById('exam-location').textContent = info.location;
}

function startCountdown() {
    if (!appData.exam_info) return;

    function updateTimer() {
        const targetDate = new Date(appData.exam_info.next_exam_date).getTime();
        const diff = targetDate - new Date().getTime();

        if (diff <= 0) return;

        document.getElementById('days').textContent = String(Math.floor(diff / (1000 * 60 * 60 * 24))).padStart(2, '0');
        document.getElementById('hours').textContent = String(Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, '0');
        document.getElementById('minutes').textContent = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
        document.getElementById('seconds').textContent = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, '0');
    }

    updateTimer();
    setInterval(updateTimer, 1000);
}

function renderHomeExamsGrid() {
    const grid = document.getElementById('exam-cards-grid');
    grid.innerHTML = '';

    appData.exams.forEach(exam => {
        const card = document.createElement('div');
        card.className = "bg-slate-800 border border-slate-700 hover:border-amber-400/50 p-5 rounded-2xl shadow-xl flex flex-col justify-between space-y-4 transition group";
        
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-2">
                    <span class="px-2.5 py-1 bg-amber-500/10 text-amber-400 font-extrabold text-xs rounded-lg border border-amber-500/20">${exam.level}</span>
                    <span class="text-xs text-slate-400 font-mono">${exam.id}</span>
                </div>
                <h3 class="text-lg font-bold text-white group-hover:text-amber-300 transition">${exam.name}</h3>
                <p class="text-xs text-slate-400 mt-1">Trình tự: Moji-Goi ➔ Bunpou ➔ Choukai (Có đếm giờ từng phần).</p>
            </div>
            <button class="btn-start-exam w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2" data-id="${exam.id}">
                <i class="fa-solid fa-play"></i> BẮT ĐẦU LÀM BÀI
            </button>
        `;

        card.querySelector('.btn-start-exam').addEventListener('click', () => {
            openExamWorkspace(exam.id);
        });

        grid.appendChild(card);
    });
}

async function openExamWorkspace(examId) {
    currentExam = appData.exams.find(e => e.id === examId);
    if (!currentExam) return;

    const togglePractice = document.getElementById('toggle-practice-mode');
    if (togglePractice) {
        isPracticeMode = togglePractice.checked;
    }

    currentSession = {
        answers: { moji_goi: {}, bunpou: {}, choukai: {} },
        flagged: { moji_goi: {}, bunpou: {}, choukai: {} },
        graded: { moji_goi: false, bunpou: false, choukai: false },
        scores: { moji_goi: null, bunpou: null, choukai: null }
    };
    localStorage.removeItem(`jlpt_session_${examId}`);

    document.getElementById('active-exam-title').textContent = `${currentExam.name} (${currentExam.level})`;
    document.getElementById('sheet-exam-title').textContent = currentExam.id;

    const modeBadge = document.getElementById('active-mode-badge');
    if (modeBadge) {
        if (isPracticeMode) {
            modeBadge.className = "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30";
            modeBadge.textContent = "Luyện tập";
        } else {
            modeBadge.className = "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30";
            modeBadge.textContent = "Thi thử";
        }
    }

    if (currentExam.choukai_audio) {
        audioPlayer.src = currentExam.choukai_audio;
        audioPlayer.playbackRate = 1.0;
        const speedSelect = document.getElementById('select-audio-speed');
        if (speedSelect) speedSelect.value = "1.0";
    } else {
        audioPlayer.removeAttribute('src');
    }

    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('exam-view').classList.remove('hidden');

    currentSectionIndex = 0;
    loadCurrentSection();
}

function loadCurrentSection() {
    stopSectionTimer();
    stopChoukaiAudio();

    const currentKey = SECTION_KEYS[currentSectionIndex];
    updateSectionIndicators();

    const sectionData = currentExam.sections[currentKey];
    if (sectionData && sectionData.pdf_url) {
        loadPDF(sectionData.pdf_url);
    }

    renderOMRSheet();

    if (!currentSession.graded[currentKey]) {
        const minutes = (sectionData && sectionData.time_limit) ? sectionData.time_limit : 20;
        startSectionTimer(minutes * 60);
    } else {
        document.getElementById('section-timer-display').textContent = "ĐÃ HOÀN THÀNH";
    }
}

function updateSectionIndicators() {
    SECTION_KEYS.forEach((key, idx) => {
        const ind = document.getElementById(`ind-${key}`);
        if (!ind) return;

        ind.className = "section-indicator px-2 sm:px-3 py-1 rounded-lg font-bold text-xs transition ";
        if (idx === currentSectionIndex) {
            ind.className += "bg-amber-400 text-slate-950 shadow";
        } else if (currentSession.graded[key]) {
            ind.className += "bg-emerald-600/30 text-emerald-400 border border-emerald-500/30";
        } else {
            ind.className += "bg-slate-800 text-slate-500";
        }
    });
}

function startSectionTimer(seconds) {
    sectionTimeRemaining = seconds;
    updateTimerDisplay();

    sectionTimerInterval = setInterval(() => {
        sectionTimeRemaining--;
        updateTimerDisplay();

        if (sectionTimeRemaining <= 0) {
            stopSectionTimer();
            alert("⏰ Đã hết thời gian làm bài phần này!");
            gradeCurrentSection();
        }
    }, 1000);
}

function stopSectionTimer() {
    if (sectionTimerInterval) {
        clearInterval(sectionTimerInterval);
        sectionTimerInterval = null;
    }
}

function updateTimerDisplay() {
    const mins = Math.floor(sectionTimeRemaining / 60);
    const secs = Math.floor(sectionTimeRemaining % 60);
    document.getElementById('section-timer-display').textContent = 
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function loadPDF(pdfUrl, retryCount = 0) {
    if (!pdfUrl) return;
    
    if (currentPdfUrl === pdfUrl && masterPdfDoc) {
        renderPDFPage(1);
        return;
    }

    const spinner = document.getElementById('pdf-spinner');
    const spinnerText = document.getElementById('pdf-spinner-text');
    if (spinner) {
        spinner.classList.remove('hidden');
        if (spinnerText) spinnerText.textContent = "Đang tải đề thi PDF...";
    }

    try {
        if (!pdfCache[pdfUrl]) {
            const loadingTask = pdfjsLib.getDocument({
                url: pdfUrl,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true
            });
            pdfCache[pdfUrl] = await loadingTask.promise;
        }

        masterPdfDoc = pdfCache[pdfUrl];
        currentPdfUrl = pdfUrl;

        if (spinner) spinner.classList.add('hidden');
        renderPDFPage(1);
    } catch (err) {
        console.error("Lỗi khi nạp file PDF:", err);
        if (retryCount < 1) {
            setTimeout(() => loadPDF(pdfUrl, retryCount + 1), 800);
            return;
        }
        if (spinner && spinnerText) {
            spinnerText.innerHTML = `<span class="text-red-400">Không thấy file PDF (${pdfUrl})</span>`;
        }
    }
}

async function renderPDFPage(pageNum) {
    if (!masterPdfDoc) return;
    currentPdfPage = pageNum;

    try {
        if (currentRenderTask) {
            currentRenderTask.cancel();
            currentRenderTask = null;
        }

        const page = await masterPdfDoc.getPage(pageNum);
        const canvas = document.getElementById('pdf-canvas');
        const wrapper = document.getElementById('pdf-wrapper');
        if (!canvas || !wrapper) return;

        // Căn tỷ lệ vừa độ rộng khung hình trên mobile ở lần nạp đầu
        if (window.innerWidth < 640 && (!currentPdfScale || currentPdfScale === 1.2)) {
            const unscaledViewport = page.getViewport({ scale: 1.0 });
            const wrapperWidth = wrapper.clientWidth - 16;
            if (wrapperWidth > 0 && unscaledViewport.width > 0) {
                currentPdfScale = wrapperWidth / unscaledViewport.width;
            }
        }

        const ctx = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: currentPdfScale });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const pageDisplay = document.getElementById('pdf-page-display');
        if (pageDisplay) {
            pageDisplay.textContent = `Trang ${pageNum}/${masterPdfDoc.numPages}`;
        }

        currentRenderTask = page.render({ canvasContext: ctx, viewport: viewport });
        await currentRenderTask.promise;
        currentRenderTask = null;
    } catch (err) {
        if (err && err.name === 'RenderingCancelledException') return;
        console.error("Lỗi khi vẽ trang PDF:", err);
    }
}

function renderOMRSheet() {
    const container = document.getElementById('omr-container');
    container.innerHTML = '';

    const currentKey = SECTION_KEYS[currentSectionIndex];
    const sectionData = currentExam.sections[currentKey];

    if (!sectionData || !sectionData.problems) {
        container.innerHTML = '<p class="text-xs text-slate-500 italic">Không có dữ liệu cho phần thi này.</p>';
        updateActionButtonUI();
        updateOMRStatsUI();
        return;
    }

    const audioBox = document.getElementById('choukai-audio-box');
    if (currentKey === 'choukai') audioBox.classList.remove('hidden');
    else audioBox.classList.add('hidden');

    const isGraded = currentSession.graded[currentKey];

    sectionData.problems.forEach((prob, probIdx) => {
        const block = document.createElement('div');
        block.className = 'omr-problem-block';

        const header = document.createElement('div');
        header.className = 'omr-problem-header';
        header.textContent = prob.title;
        block.appendChild(header);

        prob.questions.forEach(q => {
            const qKey = `${currentKey}_${probIdx}_${q.id}`;

            const row = document.createElement('div');
            row.className = 'omr-row';

            const qNum = document.createElement('span');
            qNum.className = 'omr-qnum';
            qNum.textContent = `${q.id}`;
            qNum.title = `Xem đề ở trang ${q.page}`;
            qNum.addEventListener('click', () => renderPDFPage(q.page));
            row.appendChild(qNum);

            const isFlagged = !!(currentSession.flagged[currentKey] && currentSession.flagged[currentKey][qKey]);
            const flagBtn = document.createElement('button');
            flagBtn.className = `omr-flag-btn ${isFlagged ? 'flagged' : ''}`;
            flagBtn.innerHTML = `<i class="fa-${isFlagged ? 'solid' : 'regular'} fa-bookmark"></i>`;
            flagBtn.title = isFlagged ? "Đã đánh dấu câu này" : "Đánh dấu câu phân vân";
            flagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFlagQuestion(currentKey, qKey);
            });
            row.appendChild(flagBtn);

            const bubblesDiv = document.createElement('div');
            bubblesDiv.className = 'omr-bubbles';

            const count = prob.options_count || 4;
            const userPick = currentSession.answers[currentKey][qKey];

            for (let i = 0; i < count; i++) {
                const bubble = document.createElement('button');
                const uniqueBubbleClass = `bubble-${currentKey}-${probIdx}-${q.id}-${i}`;
                bubble.className = `omr-bubble ${uniqueBubbleClass}`;
                bubble.textContent = i + 1;

                if (isGraded) {
                    bubble.disabled = true;
                    if (i === q.correct) {
                        bubble.classList.add('correct');
                    } else if (i === userPick && userPick !== q.correct) {
                        bubble.classList.add('incorrect');
                    }
                } else if (userPick !== undefined && userPick !== null) {
                    if (isPracticeMode) {
                        bubble.disabled = true;
                        if (i === q.correct) {
                            bubble.classList.add('correct');
                        }
                        if (i === userPick && userPick !== q.correct) {
                            bubble.classList.add('incorrect');
                        }
                    } else {
                        if (i === userPick) {
                            bubble.classList.add('selected');
                        }
                    }
                }

                bubble.addEventListener('click', () => {
                    selectAnswer(qKey, i, count, currentKey, probIdx, q.id);
                });

                bubblesDiv.appendChild(bubble);
            }

            row.appendChild(bubblesDiv);
            block.appendChild(row);
        });

        container.appendChild(block);
    });

    updateActionButtonUI();
    updateOMRStatsUI();
}

function toggleFlagQuestion(sectionKey, qKey) {
    if (!currentSession.flagged[sectionKey]) {
        currentSession.flagged[sectionKey] = {};
    }
    currentSession.flagged[sectionKey][qKey] = !currentSession.flagged[sectionKey][qKey];
    saveSessionToStorage(currentExam.id);
    renderOMRSheet();
}

function clearAllFlagsForCurrentSection(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const currentKey = SECTION_KEYS[currentSectionIndex];
    if (currentSession && currentSession.flagged) {
        currentSession.flagged[currentKey] = {};
        if (currentExam && currentExam.id) {
            saveSessionToStorage(currentExam.id);
        }
        renderOMRSheet();
    }
}

function selectAnswer(qKey, optionIdx, count, sectionKey, probIdx, qId) {
    if (currentSession.graded[sectionKey]) return;

    if (isPracticeMode && currentSession.answers[sectionKey][qKey] !== undefined) {
        return;
    }

    currentSession.answers[sectionKey][qKey] = optionIdx;
    saveSessionToStorage(currentExam.id);

    renderOMRSheet();
}

function getSectionStats(sectionKey) {
    const sectionData = currentExam ? currentExam.sections[sectionKey] : null;
    if (!sectionData || !sectionData.problems) return { total: 0, answered: 0, flagged: 0 };

    let total = 0;
    let answered = 0;
    let flagged = 0;

    const answers = currentSession.answers[sectionKey] || {};
    const flags = currentSession.flagged[sectionKey] || {};

    sectionData.problems.forEach((prob, probIdx) => {
        prob.questions.forEach(q => {
            total++;
            const qKey = `${sectionKey}_${probIdx}_${q.id}`;
            if (answers[qKey] !== undefined && answers[qKey] !== null) {
                answered++;
            }
            if (flags[qKey] === true) {
                flagged++;
            }
        });
    });

    return { total, answered, flagged };
}

function updateOMRStatsUI() {
    const currentKey = SECTION_KEYS[currentSectionIndex];
    const stats = getSectionStats(currentKey);

    const answeredEl = document.getElementById('stat-answered-count');
    const flaggedEl = document.getElementById('stat-flagged-count');
    const clearFlagsBtn = document.getElementById('btn-clear-flags');

    if (answeredEl) answeredEl.textContent = `${stats.answered}/${stats.total}`;
    if (flaggedEl) flaggedEl.textContent = `${stats.flagged}`;

    if (clearFlagsBtn) {
        if (stats.flagged > 0 && !currentSession.graded[currentKey]) {
            clearFlagsBtn.classList.remove('hidden');
        } else {
            clearFlagsBtn.classList.add('hidden');
        }
    }
}

function stopChoukaiAudio() {
    if (audioPlayer && !audioPlayer.paused) {
        audioPlayer.pause();
        const icon = document.getElementById('audio-icon');
        const status = document.getElementById('audio-status');
        if (icon) icon.className = "fa-solid fa-play";
        if (status) status.textContent = "Đã dừng phát audio";
    }
}

function gradeCurrentSection() {
    stopSectionTimer();
    stopChoukaiAudio();

    const currentKey = SECTION_KEYS[currentSectionIndex];
    const sectionData = currentExam.sections[currentKey];

    if (!sectionData || !sectionData.problems) return;

    let totalQuestions = 0;
    let correctCount = 0;

    sectionData.problems.forEach((prob, probIdx) => {
        prob.questions.forEach(q => {
            totalQuestions++;
            const qKey = `${currentKey}_${probIdx}_${q.id}`;
            const userPick = currentSession.answers[currentKey][qKey];

            if (userPick === q.correct) {
                correctCount++;
            }
        });
    });

    const percent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    
    currentSession.graded[currentKey] = true;
    currentSession.scores[currentKey] = {
        correct: correctCount,
        total: totalQuestions,
        percent: percent
    };

    saveSessionToStorage(currentExam.id);
    renderOMRSheet();

    const allGraded = SECTION_KEYS.every(k => currentSession.graded[k] === true);
    
    if (allGraded && !isPracticeMode) {
        saveSessionToHistory();
    }
}

function updateActionButtonUI() {
    const currentKey = SECTION_KEYS[currentSectionIndex];
    const isGraded = currentSession.graded[currentKey];

    const btnSubmit = document.getElementById('btn-submit-section');
    const btnNext = document.getElementById('btn-next-section');
    const btnOverall = document.getElementById('btn-view-overall-score');
    const resultBox = document.getElementById('section-score-result');

    if (isGraded) {
        btnSubmit.classList.add('hidden');

        if (currentSectionIndex < SECTION_KEYS.length - 1) {
            btnNext.classList.remove('hidden');
            btnOverall.classList.add('hidden');
        } else {
            btnNext.classList.add('hidden');
            btnOverall.classList.remove('hidden');
        }

        const score = currentSession.scores[currentKey];
        if (score) {
            resultBox.className = "bg-emerald-100 border border-emerald-400 p-3 rounded-lg text-center shadow-sm";
            resultBox.innerHTML = `
                <p class="text-[11px] text-emerald-800 font-bold uppercase">KẾT QUẢ PHẦN NÀY</p>
                <p class="text-2xl font-black text-emerald-700 mt-1">${score.correct} / ${score.total} câu (${score.percent}%)</p>
            `;
            resultBox.classList.remove('hidden');
        }
    } else {
        btnSubmit.classList.remove('hidden');
        btnNext.classList.add('hidden');
        btnOverall.classList.add('hidden');
        resultBox.classList.add('hidden');
    }
}

function calculateJLPTScore(scores) {
    const sectionsConfig = [
        { key: 'moji_goi', label: '1. Chữ Hán - Từ vựng (Moji-Goi)', maxPts: 60, cutoff: 19 },
        { key: 'bunpou', label: '2. Ngữ pháp - Đọc hiểu (Bunpou)', maxPts: 60, cutoff: 19 },
        { key: 'choukai', label: '3. Nghe hiểu (Choukai)', maxPts: 60, cutoff: 19 }
    ];

    let sectionResults = [];
    let totalScore = 0;
    let maxPossibleScore = 0;
    let failReasons = [];
    let activeSectionsCount = 0;

    sectionsConfig.forEach(cfg => {
        const s = scores[cfg.key] || { correct: 0, total: 0 };
        const hasQuestions = s.total > 0;

        if (hasQuestions) {
            activeSectionsCount++;
            const score = Math.round((s.correct / s.total) * cfg.maxPts);
            const isPassed = score >= cfg.cutoff;

            totalScore += score;
            maxPossibleScore += cfg.maxPts;

            if (!isPassed) {
                failReasons.push(`Điểm ${cfg.label} (${score}/${cfg.maxPts}) bị liệt (Yêu cầu ≥ ${cfg.cutoff})`);
            }

            sectionResults.push({
                key: cfg.key,
                label: cfg.label,
                correct: s.correct,
                totalQuestions: s.total,
                score: score,
                maxPts: cfg.maxPts,
                isPassed: isPassed,
                hasData: true
            });
        }
    });

    const targetOverallScore = Math.round(maxPossibleScore * (80 / 180));
    const passOverall = maxPossibleScore > 0 && totalScore >= targetOverallScore;
    const allActiveSectionsPassed = sectionResults.every(r => r.isPassed);

    const isPassed = activeSectionsCount > 0 && allActiveSectionsPassed && passOverall;

    if (!passOverall && allActiveSectionsPassed && maxPossibleScore > 0) {
        failReasons.push(`Tổng điểm (${totalScore}/${maxPossibleScore}) chưa đủ điểm sàn (Yêu cầu ≥ ${targetOverallScore})`);
    }

    return {
        sectionResults,
        totalScore,
        maxPossibleScore,
        isPassed,
        failReasons
    };
}

function showOverallScoreModal() {
    const modal = document.getElementById('overall-modal');
    const content = document.getElementById('overall-modal-content');

    const jlptResult = calculateJLPTScore(currentSession.scores);
    let modalHTML = '';

    if (isPracticeMode) {
        let sectionsDetailHTML = jlptResult.sectionResults.map(sec => `
            <div class="flex justify-between items-center p-2.5 bg-slate-800 rounded-lg">
                <div>
                    <p class="text-slate-200 font-bold">${sec.label}</p>
                </div>
                <span class="font-mono font-black text-amber-400">
                    Đúng ${sec.correct} / ${sec.totalQuestions} câu
                </span>
            </div>
        `).join('');

        modalHTML = `
            <div class="text-center pb-3 border-b border-slate-700">
                <span class="text-3xl">🎉</span>
                <h3 class="text-lg font-black text-amber-400 uppercase tracking-wider mt-1">HOÀN THÀNH LUYỆN TẬP</h3>
                <p class="text-xs text-slate-400 mt-1">${currentExam.name}</p>
                
                <div class="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl text-xs text-amber-300 my-3">
                    <i class="fa-solid fa-circle-info mr-1"></i> Chế độ Luyện tập: Kết quả này không chấm điểm thi JLPT chuẩn và <strong>không lưu vào lịch sử làm bài</strong>.
                </div>
            </div>

            <div class="space-y-2 text-xs pt-2">
                <p class="text-[11px] text-slate-400 font-bold uppercase">Thống kê số câu đúng từng phần:</p>
                ${sectionsDetailHTML}
            </div>

            <button id="btn-finish-and-go-home" class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition mt-4 flex items-center justify-center gap-2 shadow-lg">
                <i class="fa-solid fa-house"></i> TRỞ VỀ MÀN HÌNH CHÍNH
            </button>
        `;
    } else {
        const passBadgeHTML = jlptResult.isPassed 
            ? `<div class="result-badge-pass py-2 px-4 rounded-xl text-center font-black text-lg tracking-wide uppercase my-2">🎉 BẠN ĐÃ ĐẠT (合格)</div>`
            : `<div class="result-badge-fail py-2 px-4 rounded-xl text-center font-black text-lg tracking-wide uppercase my-2">⚠️ CHƯA ĐẠT (不合格)</div>`;

        let failNotesHTML = '';
        if (!jlptResult.isPassed && jlptResult.failReasons.length > 0) {
            failNotesHTML = `
                <div class="bg-red-950/60 border border-red-500/40 p-2.5 rounded-xl text-[11px] text-red-300 space-y-1 mt-2">
                    <p class="font-bold text-red-400">Lý do chưa đạt:</p>
                    ${jlptResult.failReasons.map(r => `<p>• ${r}</p>`).join('')}
                </div>
            `;
        }

        let sectionsDetailHTML = jlptResult.sectionResults.map(sec => `
            <div class="flex justify-between items-center p-2.5 bg-slate-800 rounded-lg">
                <div>
                    <p class="text-slate-200 font-bold">${sec.label}</p>
                    <p class="text-[10px] text-slate-400">Đúng ${sec.correct}/${sec.totalQuestions} câu</p>
                </div>
                <span class="font-mono font-black ${sec.isPassed ? 'text-emerald-400' : 'text-red-400'}">
                    ${sec.score} / ${sec.maxPts}
                </span>
            </div>
        `).join('');

        modalHTML = `
            <div class="text-center pb-3 border-b border-slate-700">
                <span class="text-3xl">🏆</span>
                <h3 class="text-lg font-black text-amber-400 uppercase tracking-wider mt-1">KẾT QUẢ THI JLPT CHUẨN</h3>
                <p class="text-xs text-slate-400 mt-1">${currentExam.name}</p>
                
                ${passBadgeHTML}

                <p class="text-4xl font-black text-amber-400 my-1">${jlptResult.totalScore} <span class="text-base text-slate-400 font-normal">/ ${jlptResult.maxPossibleScore} điểm</span></p>
                ${failNotesHTML}
            </div>

            <div class="space-y-2 text-xs pt-2">
                <p class="text-[11px] text-slate-400 font-bold uppercase">Chi tiết theo từng phần thi:</p>
                ${sectionsDetailHTML}
            </div>

            <button id="btn-finish-and-go-home" class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition mt-4 flex items-center justify-center gap-2 shadow-lg">
                <i class="fa-solid fa-house"></i> TRỞ VỀ MÀN HÌNH CHÍNH
            </button>
        `;
    }

    content.innerHTML = modalHTML;
    document.getElementById('btn-finish-and-go-home').addEventListener('click', closeSummaryAndReturnHome);

    modal.classList.remove('hidden');
}

function closeSummaryAndReturnHome() {
    document.getElementById('overall-modal').classList.add('hidden');
    backToHome();
}

function saveSessionToHistory() {
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem('jlpt_history') || '[]');
    } catch (e) {
        history = [];
    }

    const jlptResult = calculateJLPTScore(currentSession.scores);

    const record = {
        id: Date.now(),
        examId: currentExam.id,
        examName: currentExam.name,
        date: new Date().toLocaleString('vi-VN'),
        totalScore: jlptResult.totalScore,
        maxPossibleScore: jlptResult.maxPossibleScore,
        isPassed: jlptResult.isPassed,
        sectionResults: jlptResult.sectionResults.map(sec => ({
            key: sec.key,
            label: sec.key === 'moji_goi' ? 'Moji' : (sec.key === 'bunpou' ? 'Bunpou' : 'Choukai'),
            correct: sec.correct,
            totalQuestions: sec.totalQuestions,
            score: sec.score,
            maxPts: sec.maxPts
        }))
    };

    history.unshift(record);
    localStorage.setItem('jlpt_history', JSON.stringify(history));
}

function saveSessionToStorage(examId) {
    localStorage.setItem(`jlpt_session_${examId}`, JSON.stringify(currentSession));
}

function renderHistoryTable() {
    const container = document.getElementById('history-container');
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem('jlpt_history') || '[]');
    } catch (e) {
        history = [];
    }

    if (history.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-500 italic py-4 text-center">Chưa có lịch sử làm bài nào (Chỉ lưu kết quả từ Chế độ Thi thử).</p>';
        return;
    }

    let rowsHTML = history.map(item => {
        const maxPts = item.maxPossibleScore || 180;
        const totalPts = item.totalScore !== undefined ? item.totalScore : (item.jlptScore !== undefined ? item.jlptScore : 0);
        const passText = item.isPassed ? 'Đạt (合格)' : 'Chưa đạt (不合格)';
        const passClass = item.isPassed ? 'text-emerald-400' : 'text-red-400';

        let detailStr = '';

        if (item.sectionResults && Array.isArray(item.sectionResults) && item.sectionResults.length > 0) {
            detailStr = item.sectionResults.map(sec => {
                const countInfo = (sec.correct !== undefined && sec.totalQuestions !== undefined) 
                    ? ` <span class="text-slate-400">(${sec.correct}/${sec.totalQuestions} câu)</span>` 
                    : '';
                return `${sec.label}: <strong class="text-amber-300">${sec.score}/${sec.maxPts}đ</strong>${countInfo}`;
            }).join(' <span class="text-slate-600">|</span> ');
        } else {
            detailStr = '<span class="text-slate-500">Chưa nộp bài</span>';
        }

        return `
            <tr class="border-b border-slate-700/60 hover:bg-slate-700/30 text-xs transition">
                <td class="py-3 px-3 text-slate-400 font-mono">${item.date}</td>
                <td class="py-3 px-3 font-bold text-amber-300">${item.examName}</td>
                <td class="py-3 px-3 font-mono font-bold">
                    <span class="${passClass}">
                        ${totalPts}/${maxPts} (${passText})
                    </span>
                </td>
                <td class="py-3 px-3 text-slate-300 font-mono">
                    ${detailStr}
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="border-b border-slate-700 text-[11px] text-slate-400 uppercase font-bold">
                    <th class="py-2 px-3">Thời gian</th>
                    <th class="py-2 px-3">Tên Đề Thi</th>
                    <th class="py-2 px-3">Thang Điểm JLPT</th>
                    <th class="py-2 px-3">Chi Tiết Điểm Từng Phần</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHTML}
            </tbody>
        </table>
    `;
}

function backToHome() {
    stopSectionTimer();
    stopChoukaiAudio();
    document.getElementById('exam-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');
    renderHistoryTable();
}

function formatAudioTime(seconds) {
    if (isNaN(seconds) || seconds <= 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function showSubmitConfirmModal() {
    const currentKey = SECTION_KEYS[currentSectionIndex];
    const stats = getSectionStats(currentKey);
    const modal = document.getElementById('submit-confirm-modal');
    const content = document.getElementById('submit-confirm-modal-content');

    const isComplete = stats.answered === stats.total;
    const hasUnanswered = stats.answered < stats.total;
    const hasFlagged = stats.flagged > 0;
    const unansweredCount = stats.total - stats.answered;

    let warningBadges = '';

    if (hasUnanswered) {
        warningBadges += `
            <div class="bg-red-950/70 border border-red-500/50 p-3 rounded-xl flex items-start gap-2.5 text-xs text-red-200">
                <i class="fa-solid fa-triangle-exclamation text-red-400 text-base mt-0.5 flex-shrink-0"></i>
                <div>
                    <strong class="text-red-400 block font-bold text-xs">Còn ${unansweredCount} câu BỎ TRỐNG chưa làm!</strong>
                    <span class="text-[11px] text-red-300">Bạn chưa chọn đáp án cho tất cả các câu hỏi trong phần này.</span>
                </div>
            </div>
        `;
    }

    if (hasFlagged) {
        warningBadges += `
            <div class="bg-amber-950/70 border border-amber-500/50 p-3 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
                <i class="fa-solid fa-bookmark text-amber-400 text-base mt-0.5 flex-shrink-0"></i>
                <div>
                    <strong class="text-amber-400 block font-bold text-xs">Đang ĐÁNH DẤU ${stats.flagged} câu nghi vấn!</strong>
                    <span class="text-[11px] text-amber-300">Vẫn còn câu chưa chắc chắn bạn chưa quay lại kiểm tra.</span>
                </div>
            </div>
        `;
    }

    if (isComplete && !hasFlagged) {
        warningBadges += `
            <div class="bg-emerald-950/70 border border-emerald-500/50 p-3 rounded-xl flex items-start gap-2.5 text-xs text-emerald-200">
                <i class="fa-solid fa-circle-check text-emerald-400 text-base mt-0.5 flex-shrink-0"></i>
                <div>
                    <strong class="text-emerald-400 block font-bold text-xs">Đã hoàn thành 100%!</strong>
                    <span class="text-[11px] text-emerald-300">Bạn đã điền đủ ${stats.total} câu và không còn câu đánh dấu.</span>
                </div>
            </div>
        `;
    }

    content.innerHTML = `
        <div class="text-center pb-3 border-b border-slate-700">
            <span class="text-3xl">📋</span>
            <h3 class="text-lg font-black text-amber-400 uppercase tracking-wider mt-1">XÁC NHẬN NỘP BÀI PHẦN THI</h3>
            <p class="text-xs text-slate-400 mt-1">${currentExam ? currentExam.name : ''}</p>
        </div>

        <div class="space-y-2.5 pt-1">
            <div class="bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-center text-xs">
                <span class="text-slate-300 font-bold">Tiến độ làm bài phần này:</span>
                <span class="font-mono font-black text-amber-400 text-sm">${stats.answered} / ${stats.total} câu</span>
            </div>

            ${warningBadges}
        </div>

        <div class="grid grid-cols-2 gap-3 pt-2">
            <button id="btn-modal-cancel-submit" class="py-2.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow">
                <i class="fa-solid fa-arrow-left"></i> Quay lại kiểm tra
            </button>
            <button id="btn-modal-confirm-submit" class="py-2.5 px-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow">
                <i class="fa-solid fa-check-double"></i> Xác nhận nộp bài
            </button>
        </div>
    `;

    document.getElementById('btn-modal-cancel-submit').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    document.getElementById('btn-modal-confirm-submit').addEventListener('click', () => {
        modal.classList.add('hidden');
        gradeCurrentSection();
    });

    modal.classList.remove('hidden');
}

function setupPdfDragToScroll() {
    const wrapper = document.getElementById('pdf-wrapper');
    if (!wrapper) return;

    let isDown = false;
    let startX, startY, scrollLeft, scrollTop;

    wrapper.addEventListener('mousedown', (e) => {
        isDown = true;
        wrapper.classList.add('is-dragging');
        startX = e.pageX - wrapper.offsetLeft;
        startY = e.pageY - wrapper.offsetTop;
        scrollLeft = wrapper.scrollLeft;
        scrollTop = wrapper.scrollTop;
    });

    wrapper.addEventListener('mouseleave', () => {
        isDown = false;
        wrapper.classList.remove('is-dragging');
    });

    wrapper.addEventListener('mouseup', () => {
        isDown = false;
        wrapper.classList.remove('is-dragging');
    });

    wrapper.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - wrapper.offsetLeft;
        const y = e.pageY - wrapper.offsetTop;
        const walkX = (x - startX) * 1.5;
        const walkY = (y - startY) * 1.5;
        wrapper.scrollLeft = scrollLeft - walkX;
        wrapper.scrollTop = scrollTop - walkY;
    });
}

function initEventListeners() {
    document.getElementById('nav-logo').addEventListener('click', backToHome);

    const togglePractice = document.getElementById('toggle-practice-mode');
    const practiceLabel = document.getElementById('practice-mode-label');
    if (togglePractice) {
        togglePractice.checked = isPracticeMode;
        togglePractice.addEventListener('change', (e) => {
            isPracticeMode = e.target.checked;
            if (practiceLabel) {
                practiceLabel.textContent = isPracticeMode 
                    ? "Luyện tập (Báo đáp án ngay, không tính điểm & không lưu lịch sử)" 
                    : "Thi thử (Bảo mật đáp án, tính điểm JLPT & lưu lịch sử)";
            }
        });
    }

    document.getElementById('btn-home-nav').addEventListener('click', backToHome);
    document.getElementById('btn-back-to-home').addEventListener('click', backToHome);

    const btnClearFlags = document.getElementById('btn-clear-flags');
    if (btnClearFlags) {
        btnClearFlags.addEventListener('click', clearAllFlagsForCurrentSection);
    }

    const audioProgress = document.getElementById('audio-progress');
    const audioCurrentTime = document.getElementById('audio-current-time');
    const audioDuration = document.getElementById('audio-duration');
    const audioTimelineContainer = document.getElementById('audio-timeline-container');
    const btnToggleTimeline = document.getElementById('btn-toggle-audio-timeline');
    const timelineToggleIcon = document.getElementById('timeline-toggle-icon');

    document.getElementById('btn-audio-rewind').addEventListener('click', () => {
        if (audioPlayer) {
            audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
        }
    });

    document.getElementById('btn-audio-forward').addEventListener('click', () => {
        if (audioPlayer) {
            audioPlayer.currentTime = Math.min(audioPlayer.duration || 0, audioPlayer.currentTime + 5);
        }
    });

    document.getElementById('select-audio-speed').addEventListener('change', (e) => {
        if (audioPlayer) {
            audioPlayer.playbackRate = parseFloat(e.target.value);
        }
    });

    btnToggleTimeline.addEventListener('click', () => {
        const isHidden = audioTimelineContainer.classList.contains('hidden');
        if (isHidden) {
            audioTimelineContainer.classList.remove('hidden');
            timelineToggleIcon.className = "fa-solid fa-eye";
        } else {
            audioTimelineContainer.classList.add('hidden');
            timelineToggleIcon.className = "fa-solid fa-eye-slash";
        }
    });

    playAudioBtn.addEventListener('click', () => {
        const icon = document.getElementById('audio-icon');
        const status = document.getElementById('audio-status');

        if (audioPlayer.paused) {
            audioPlayer.play();
            icon.className = "fa-solid fa-pause";
            status.textContent = "Đang phát đĩa nghe...";
        } else {
            audioPlayer.pause();
            icon.className = "fa-solid fa-play";
            status.textContent = "Đã tạm dừng";
        }
    });

    audioPlayer.addEventListener('loadedmetadata', () => {
        audioDuration.textContent = formatAudioTime(audioPlayer.duration);
        audioProgress.max = Math.floor(audioPlayer.duration);
        audioProgress.value = 0;
        audioCurrentTime.textContent = "00:00";
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (!isNaN(audioPlayer.duration)) {
            audioProgress.value = Math.floor(audioPlayer.currentTime);
            audioCurrentTime.textContent = formatAudioTime(audioPlayer.currentTime);
        }
    });

    audioProgress.addEventListener('input', () => {
        audioPlayer.currentTime = audioProgress.value;
        audioCurrentTime.textContent = formatAudioTime(audioPlayer.value);
    });

    audioPlayer.addEventListener('ended', () => {
        const icon = document.getElementById('audio-icon');
        const status = document.getElementById('audio-status');
        icon.className = "fa-solid fa-play";
        status.textContent = "Đã hoàn thành đĩa nghe";
        audioProgress.value = 0;
        audioCurrentTime.textContent = "00:00";
    });

    document.getElementById('btn-submit-section').addEventListener('click', showSubmitConfirmModal);
    
    document.getElementById('btn-close-confirm-modal').addEventListener('click', () => {
        document.getElementById('submit-confirm-modal').classList.add('hidden');
    });

    document.getElementById('btn-next-section').addEventListener('click', () => {
        if (currentSectionIndex < SECTION_KEYS.length - 1) {
            currentSectionIndex++;
            loadCurrentSection();
        }
    });

    document.getElementById('btn-view-overall-score').addEventListener('click', showOverallScoreModal);
    document.getElementById('btn-close-modal').addEventListener('click', closeSummaryAndReturnHome);

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        currentPdfScale += 0.15;
        renderPDFPage(currentPdfPage);
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        if (currentPdfScale > 0.6) {
            currentPdfScale -= 0.15;
            renderPDFPage(currentPdfPage);
        }
    });

    document.getElementById('btn-pdf-prev').addEventListener('click', () => {
        if (currentPdfPage > 1) renderPDFPage(currentPdfPage - 1);
    });

    document.getElementById('btn-pdf-next').addEventListener('click', () => {
        if (masterPdfDoc && currentPdfPage < masterPdfDoc.numPages) renderPDFPage(currentPdfPage + 1);
    });

    document.getElementById('btn-clear-history').addEventListener('click', () => {
        if (confirm("Bạn có chắc muốn xóa toàn bộ lịch sử làm bài?")) {
            localStorage.removeItem('jlpt_history');
            renderHistoryTable();
        }
    });

    setupPdfDragToScroll();
}