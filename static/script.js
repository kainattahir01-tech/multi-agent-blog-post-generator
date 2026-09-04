document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('generator-form');
    const topicInput = document.getElementById('topic');
    const toneSelect = document.getElementById('tone');
    const lengthSelect = document.getElementById('length');
    const apiKeyInput = document.getElementById('api-key');
    const toggleKeyBtn = document.getElementById('toggle-key-visibility');
    const generateBtn = document.getElementById('generate-btn');
    
    // Step Status Elements
    const stepResearch = document.getElementById('step-research');
    const stepWriter = document.getElementById('step-writer');
    const stepEditor = document.getElementById('step-editor');
    const stepSeo = document.getElementById('step-seo');
    
    // Console Log Element
    const consoleLogs = document.getElementById('console-logs'); 
    
    // Output Panes
    const researchOutput = document.getElementById('research-output');
    const writerOutput = document.getElementById('writer-output');
    const editorOutput = document.getElementById('editor-output');
    const seoOutput = document.getElementById('seo-output');
    
    // Editor Action Buttons
    const copyBtn = document.getElementById('copy-btn');
    const toggleRawBtn = document.getElementById('toggle-raw');
    const pdfBtn = document.getElementById('pdf-btn');
    const htmlBtn = document.getElementById('html-btn');
    
    // Tab Elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Progress Bar Element
    const topProgressBar = document.getElementById('top-progress-bar');

    // State Variables
    let eventSource = null;
    let researchText = "";
    let writerText = "";
    let editorText = "";
    let seoText = "";
    let showRaw = false;

    // Mobile Fallback and Timer State Variables
    let fetchController = null;
    let isFetchingFallback = false;
    let onerrorCount = 0;
    let timeoutTimer = null;
    let startTime = null;
    let timerInterval = null;
    let livenessTimer = null;

    // Toggle API Key Visibility
    toggleKeyBtn.addEventListener('click', () => {
        const type = apiKeyInput.type === 'password' ? 'text' : 'password';
        apiKeyInput.type = type;
        const icon = toggleKeyBtn.querySelector('i');
        if (type === 'text') {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });

    // Tab Switching Logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            // Remove active classes
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Add active class to current
            btn.classList.add('active');
            const targetPane = document.getElementById(targetTab);
            targetPane.classList.add('active');
        });
    });

    // Function to programmatically switch tabs
    function switchTab(tabId) {
        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (btn) btn.click();
    }

    // Logger Utility
    function log(message, isError = false) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        consoleLogs.innerHTML = `<span style="color: var(--text-muted)">[${time}]</span> <span class="${isError ? 'error' : ''}">${message}</span>`;
        consoleLogs.scrollTop = consoleLogs.scrollHeight;
    }

    // Set Timeline Step Status UI
    function updateStepUI(stepElement, status) {
        const badge = stepElement.querySelector('.step-status');
        
        // Reset classes
        stepElement.classList.remove('active', 'completed');
        badge.classList.remove('status-idle', 'status-active', 'status-completed');
        
        if (status === 'active') {
            stepElement.classList.add('active');
            badge.classList.add('status-active');
            badge.textContent = 'Active';
        } else if (status === 'completed') {
            stepElement.classList.add('completed');
            badge.classList.add('status-completed');
            badge.textContent = 'Completed';
        } else {
            badge.classList.add('status-idle');
            badge.textContent = 'Idle';
        }
    }

    // Copy to Clipboard Functionality
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(editorText).then(() => {
            showToast("Copied polished blog post to clipboard!");
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    });

    // Toggle Raw / Preview Markdown
    toggleRawBtn.addEventListener('click', () => {
        showRaw = !showRaw;
        renderEditorOutput();
    });

    function renderEditorOutput() {
        if (showRaw) {
            editorOutput.innerHTML = `<pre><code>${escapeHtml(editorText)}</code></pre>`;
            toggleRawBtn.innerHTML = `<i class="fa-solid fa-file-lines"></i> Show Preview`;
        } else {
            editorOutput.innerHTML = marked.parse(editorText);
            toggleRawBtn.innerHTML = `<i class="fa-solid fa-code"></i> Show Raw MD`;
        }
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Custom Toast Notification
    function showToast(message) {
        let toast = document.getElementById('app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast';
            toast.className = 'toast';
            toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span class="toast-msg"></span>`;
            document.body.appendChild(toast);
        }
        toast.querySelector('.toast-msg').textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Words / Duration stats tracker helper functions
    function startStatsTimer() {
        startTime = Date.now();
        document.getElementById('info-agent-time').textContent = '0s';
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            document.getElementById('info-agent-time').textContent = elapsed + 's';
        }, 1000);
    }

    function stopStatsTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function updateEditorStats() {
        const wordCount = editorText.trim() ? editorText.trim().split(/\s+/).length : 0;
        const readingTime = Math.ceil(wordCount / 200);
        document.getElementById('info-word-count').textContent = wordCount;
        document.getElementById('info-reading-time').textContent = readingTime + ' min';
    }

    // 120 Seconds Timeout Timer
    function startTimeoutTimer(url) {
        clearTimeoutTimer();
        timeoutTimer = setTimeout(() => {
            log("Connection timed out. Please try again.", true);
            terminateConnection();
            handleErrorEvent({ message: "Connection timed out. Please try again." });
        }, 120000);
    }

    function clearTimeoutTimer() {
        if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            timeoutTimer = null;
        }
    }

    // 5 Seconds EventSource Handshake Liveness Check
    function startLivenessCheck(url) {
        clearLivenessCheck();
        livenessTimer = setTimeout(() => {
            if (eventSource && eventSource.readyState === EventSource.CONNECTING) {
                log("SSE connection handshake timed out. Switching to Fetch-based fallback...");
                terminateConnection();
                startFetchFallback(url);
            }
        }, 5000);
    }

    function clearLivenessCheck() {
        if (livenessTimer) {
            clearTimeout(livenessTimer);
            livenessTimer = null;
        }
    }

    function terminateConnection() {
        clearTimeoutTimer();
        clearLivenessCheck();
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        if (fetchController) {
            fetchController.abort();
            fetchController = null;
        }
        isFetchingFallback = false;
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        if (eventSource) {
            eventSource.close();
            eventSource = null;
            resetButtonState();
            return;
        }
        const topic = topicInput.value.trim();
        if (!topic) {
            alert('Please enter a blog topic');
            return;
        }
        const tone = toneSelect.value;
        const length = lengthSelect.value;
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        let url = '/api/generate?topic=' + encodeURIComponent(topic) + '&tone=' + encodeURIComponent(tone) + '&length=' + encodeURIComponent(length);
        if (apiKey) {
            url += '&api_key=' + encodeURIComponent(apiKey);
        }
        generateBtn.innerHTML = '<span>Terminate Pipeline</span>';
        generateBtn.classList.add('running');
        document.body.classList.add('generating');

        // Reset text buffers and UI steps
        researchText = "";
        writerText = "";
        editorText = "";
        seoText = "";
        startStatsTimer();
        updateStepUI(stepResearch, 'idle');
        updateStepUI(stepWriter, 'idle');
        updateStepUI(stepEditor, 'idle');
        updateStepUI(stepSeo, 'idle');
        document.getElementById('info-word-count').textContent = '0';
        document.getElementById('info-reading-time').textContent = '0 min';

        eventSource = new EventSource(url);
        eventSource.onmessage = function(event) {
            console.log('SSE message received:', event.data);
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'status') handleStatusEvent(data);
                else if (data.event === 'content') handleContentEvent(data);
                else if (data.event === 'complete') handleCompleteEvent(data);
                else if (data.event === 'error') handleErrorEvent(data);
            } catch(err) {
                console.error('Parse error:', err);
            }
        };
        eventSource.onerror = function(err) {
            console.error('SSE error details:', err, 'readyState:', eventSource.readyState);
            if (eventSource.readyState === EventSource.CLOSED) {
                log('Connection closed by server. Check that your API key is valid.', true);
            } else {
                log('Connection error — retrying...', true);
            }
            eventSource.close();
            eventSource = null;
            resetButtonState();
        };
    });

    function handleStatusEvent(data) {
        log(data.message);
        
        if (data.agent === 'research') {
            if (data.status === 'start') {
                updateStepUI(stepResearch, 'active');
                switchTab('tab-research');
                researchOutput.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Research Agent is researching the topic... Please wait.</p></div>';
            } else if (data.status === 'done') {
                updateStepUI(stepResearch, 'completed');
                document.querySelector('.copy-tab-btn[data-target="research-output"]').style.display = 'block';
            }
        } else if (data.agent === 'writer') {
            if (data.status === 'start') {
                updateStepUI(stepWriter, 'active');
                switchTab('tab-writer');
                writerOutput.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Writing Agent is drafting the post... (This can take 15-30 seconds depending on length)</p></div>';
            } else if (data.status === 'done') {
                updateStepUI(stepWriter, 'completed');
                document.querySelector('.copy-tab-btn[data-target="writer-output"]').style.display = 'block';
            }
        } else if (data.agent === 'editor') {
            if (data.status === 'start') {
                updateStepUI(stepEditor, 'active');
                switchTab('tab-editor');
                editorOutput.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Editing Agent is refining the draft... (This can take 15-30 seconds)</p></div>';
            } else if (data.status === 'done') {
                updateStepUI(stepEditor, 'completed');
                copyBtn.style.display = 'flex';
                toggleRawBtn.style.display = 'flex';
                pdfBtn.style.display = 'flex';
                htmlBtn.style.display = 'flex';
            }
        } else if (data.agent === 'seo') {
            if (data.status === 'start') {
                updateStepUI(stepSeo, 'active');
                switchTab('tab-seo');
                seoOutput.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>SEO Agent is running diagnostics and generating tags...</p></div>';
            } else if (data.status === 'done') {
                updateStepUI(stepSeo, 'completed');
                document.querySelector('.copy-tab-btn[data-target="seo-output"]').style.display = 'block';
            }
        }
    }

    function handleContentEvent(data) {
        if (data.agent === 'research') {
            researchText += data.text;
            researchOutput.innerHTML = marked.parse(researchText);
            researchOutput.scrollTop = researchOutput.scrollHeight;
        } else if (data.agent === 'writer') {
            writerText += data.text;
            writerOutput.innerHTML = marked.parse(writerText);
            writerOutput.scrollTop = writerOutput.scrollHeight;
        } else if (data.agent === 'editor') {
            editorText += data.text;
            renderEditorOutput();
            updateEditorStats();
            editorOutput.scrollTop = editorOutput.scrollHeight;
        } else if (data.agent === 'seo') {
            seoText += data.text;
            seoOutput.innerHTML = marked.parse(seoText);
            seoOutput.scrollTop = seoOutput.scrollHeight;
        }
    }

    function handleCompleteEvent(data) {
        log(data.message);
        showToast("Blog post successfully generated!");
        
        stopStatsTimer();

        // Save to History
        const topic = topicInput.value.trim();
        const date = new Date().toLocaleDateString();
        saveToHistory(topic, date, editorText);
        
        resetButtonState();
    }

    function handleErrorEvent(data) {
        log(`Error: ${data.message}`, true);
        stopStatsTimer();
        
        const activePane = document.querySelector('.tab-pane.active .output-content');
        if (activePane) {
            activePane.innerHTML = `
                <div class="empty-state" style="color: #ef4444;">
                    <i class="fa-solid fa-circle-exclamation" style="background: none; -webkit-text-fill-color: #ef4444;"></i>
                    <p><strong>Pipeline Error</strong></p>
                    <p style="font-size: 0.85rem; max-width: 320px; line-height: 1.5;">${escapeHtml(data.message)}</p>
                </div>
            `;
        }
        
        resetButtonState();
    }

    function resetButtonState() {
        document.body.classList.remove('generating');
        generateBtn.classList.remove('running');
        generateBtn.innerHTML = `<span><i class="fa-solid fa-rocket"></i> Launch Pipeline</span>`;
        
        if (topProgressBar) {
            topProgressBar.classList.remove('loading');
            topProgressBar.classList.add('fade-out');
        }

        // Reset active steps to idle
        if (stepResearch.classList.contains('active')) updateStepUI(stepResearch, 'idle');
        if (stepWriter.classList.contains('active')) updateStepUI(stepWriter, 'idle');
        if (stepEditor.classList.contains('active')) updateStepUI(stepEditor, 'idle');
        if (stepSeo.classList.contains('active')) updateStepUI(stepSeo, 'idle');
    }

    // PDF Click Handler
    pdfBtn.addEventListener('click', () => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            showToast("Popup blocked! Please allow popups to print PDF.");
            return;
        }
        
        printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${escapeHtml(topicInput.value.trim() || 'Blog Post')}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Inter', sans-serif;
                    background: white;
                    color: #1a1a2e;
                    padding: 2rem;
                    max-width: 800px;
                    margin: 0 auto;
                    line-height: 1.6;
                }
                h1, h2, h3, h4 { color: #1a1a2e; margin-top: 1.5rem; margin-bottom: 0.75rem; font-weight: 700; }
                h1 { font-size: 2.2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
                h2 { font-size: 1.6rem; }
                h3 { font-size: 1.25rem; }
                p { margin-bottom: 1rem; }
                pre { background: #f3f4f6; padding: 1rem; border-radius: 6px; overflow-x: auto; margin-bottom: 1rem; }
                code { font-family: monospace; background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
                pre code { background: transparent; padding: 0; }
                blockquote { border-left: 4px solid var(--accent-blue, #6d28d9); padding-left: 1rem; margin-left: 0; color: #4b5563; font-style: italic; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
                th, td { border: 1px solid #d1d5db; padding: 0.5rem; text-align: left; }
                th { background: #f3f4f6; }
                ul, ol { margin-bottom: 1rem; padding-left: 1.5rem; }
                li { margin-bottom: 0.25rem; }
            </style>
        </head>
        <body>
            ${editorOutput.innerHTML}
        </body>
        </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 300);
    });

    // HTML Export click listener
    if (htmlBtn) {
        htmlBtn.addEventListener('click', () => {
            const activeColor = userPrefs.accentColor || '#6d28d9';
            const titleText = editorOutput.querySelector('h1')?.textContent || topicInput.value.trim() || 'Blog Post';
            const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(titleText)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background-color: white;
            color: #1a1a2e;
            line-height: 1.8;
            font-size: 17px;
            max-width: 720px;
            margin: 40px auto;
            padding: 0 20px;
        }
        h1, h2, h3, h4 {
            color: ${activeColor};
            font-weight: 700;
            margin-top: 2rem;
            margin-bottom: 1rem;
        }
        h1 { font-size: 2.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
        h2 { font-size: 1.8rem; }
        h3 { font-size: 1.4rem; }
        p { margin-bottom: 1.25rem; }
        pre { background-color: #f3f4f6; padding: 1.25rem; border-radius: 8px; overflow-x: auto; margin-bottom: 1.5rem; }
        code { font-family: monospace; background-color: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px; }
        pre code { background: transparent; padding: 0; }
        blockquote { border-left: 4px solid ${activeColor}; padding-left: 1.25rem; margin-left: 0; color: #4b5563; font-style: italic; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
        th, td { border: 1px solid #e5e7eb; padding: 0.75rem; text-align: left; }
        th { background-color: #f9fafb; }
        ul, ol { margin-bottom: 1.25rem; padding-left: 1.5rem; }
        li { margin-bottom: 0.35rem; }
    </style>
</head>
<body>
    ${editorOutput.innerHTML}
</body>
</html>`;
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${topicInput.value.trim().replace(/\s+/g, '-') || 'blog-post'}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast("Exported post as HTML file!");
        });
    }

    // Copy tab content icon buttons
    const copyTabBtns = document.querySelectorAll('.copy-tab-btn');
    copyTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            let text = "";
            if (targetId === 'research-output') text = researchText;
            else if (targetId === 'writer-output') text = writerText;
            else if (targetId === 'seo-output') text = seoText;

            if (text) {
                navigator.clipboard.writeText(text).then(() => {
                    showToast("Copied tab content successfully!");
                }).catch(err => {
                    console.error("Failed to copy tab content:", err);
                });
            }
        });
    });

    // Collapsible Settings Panel UI elements
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsContent = document.getElementById('settings-content');
    const settingsResetBtn = document.getElementById('settings-reset-btn');
    const themeBtns = document.querySelectorAll('.theme-btn');
    const fontSizeSelect = document.getElementById('pref-font-size');
    const colorSwatches = document.querySelectorAll('.color-swatch');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    if (settingsToggle && settingsContent) {
        settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = settingsContent.style.display === 'block';
            settingsContent.style.display = isVisible ? 'none' : 'block';
            settingsToggle.classList.toggle('open', !isVisible);
        });

        // Close settings when clicking outside
        document.addEventListener('click', (e) => {
            if (settingsContent.style.display === 'block') {
                if (!settingsContent.contains(e.target) && !settingsToggle.contains(e.target)) {
                    settingsContent.style.display = 'none';
                    settingsToggle.classList.remove('open');
                }
            }
        });
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            localStorage.removeItem('blogHistory');
            renderHistory();
            showToast("History cleared.");
        });
    }

    // Save history array (limit to max 10 entries)
    function saveToHistory(topic, date, content) {
        let history = JSON.parse(localStorage.getItem('blogHistory') || '[]');
        history = history.filter(item => item.topic.toLowerCase() !== topic.toLowerCase());
        history.unshift({ topic, date, content });
        if (history.length > 10) {
            history = history.slice(0, 10);
        }
        localStorage.setItem('blogHistory', JSON.stringify(history));
        renderHistory();
    }

    // Render history inside Settings panel
    function renderHistory() {
        const historySection = document.getElementById('history-section');
        const historyList = document.getElementById('history-list');
        const historyCount = document.getElementById('history-count');
        if (!historySection || !historyList) return;

        let history = JSON.parse(localStorage.getItem('blogHistory') || '[]');
        if (historyCount) historyCount.textContent = history.length;

        if (history.length === 0) {
            historySection.style.display = 'none';
            return;
        }

        historySection.style.display = 'block';
        historyList.innerHTML = '';

        history.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'history-btn';
            btn.innerHTML = `<span class="history-topic">${escapeHtml(item.topic)}</span> <span class="history-date">${item.date}</span>`;
            btn.addEventListener('click', () => {
                editorText = item.content;
                showRaw = false;
                renderEditorOutput();
                
                // Show action buttons
                copyBtn.style.display = 'flex';
                toggleRawBtn.style.display = 'flex';
                pdfBtn.style.display = 'flex';
                htmlBtn.style.display = 'flex';

                switchTab('tab-editor');
                log(`Loaded post from history: "${item.topic}"`);
            });
            historyList.appendChild(btn);
        });
    }

    // Default Settings Preferences
    const defaultPrefs = {
        theme: 'dark',
        fontSize: 'medium',
        accentColor: '#6d28d9'
    };

    let userPrefs = JSON.parse(localStorage.getItem('userPrefs')) || { ...defaultPrefs };

    // Theme select toggle buttons
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            applyTheme(theme);
            savePrefs();
        });
    });

    // Font size selector option change
    if (fontSizeSelect) {
        fontSizeSelect.addEventListener('change', () => {
            applyFontSize(fontSizeSelect.value);
            savePrefs();
        });
    }

    // Accent color preset color swatches
    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            const color = swatch.getAttribute('data-color');
            applyAccentColor(color);
            savePrefs();
        });
    });

    // Reset settings button handler
    if (settingsResetBtn) {
        settingsResetBtn.addEventListener('click', () => {
            userPrefs = { ...defaultPrefs };
            applyPrefs();
            savePrefs();
            showToast("Settings reset to defaults.");
        });
    }

    function savePrefs() {
        localStorage.setItem('userPrefs', JSON.stringify(userPrefs));
    }

    function applyPrefs() {
        applyTheme(userPrefs.theme);
        applyFontSize(userPrefs.fontSize);
        applyAccentColor(userPrefs.accentColor);
    }

    function applyTheme(theme) {
        userPrefs.theme = theme;
        themeBtns.forEach(btn => {
            if (btn.getAttribute('data-theme') === theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        if (theme === 'light') {
            document.body.classList.add('theme-light');
        } else {
            document.body.classList.remove('theme-light');
        }
    }

    function applyFontSize(size) {
        userPrefs.fontSize = size;
        if (fontSizeSelect) fontSizeSelect.value = size;
        document.body.classList.remove('font-small', 'font-medium', 'font-large');
        document.body.classList.add(`font-${size}`);
    }

    function applyAccentColor(color) {
        userPrefs.accentColor = color;
        colorSwatches.forEach(swatch => {
            if (swatch.getAttribute('data-color') === color) {
                swatch.classList.add('active');
            } else {
                swatch.classList.remove('active');
            }
        });

        const root = document.documentElement;
        root.style.setProperty('--accent-blue', color);
        
        let gradientEnd = color;
        let hoverStart = color;
        let hoverEnd = color;
        if (color === '#6d28d9') {
            gradientEnd = '#4c1d95';
            hoverStart = '#4c1d95';
            hoverEnd = '#3b0764';
        } else if (color === '#1e40af') {
            gradientEnd = '#1e3a8a';
            hoverStart = '#1e3a8a';
            hoverEnd = '#172554';
        } else if (color === '#065f46') {
            gradientEnd = '#064e3b';
            hoverStart = '#064e3b';
            hoverEnd = '#022c22';
        } else if (color === '#be185d') {
            gradientEnd = '#9d174d';
            hoverStart = '#9d174d';
            hoverEnd = '#500724';
        }
        
        root.style.setProperty('--accent-purple', gradientEnd);
        root.style.setProperty('--gradient-btn', `linear-gradient(135deg, ${gradientEnd} 0%, ${color} 100%)`);
        root.style.setProperty('--gradient-btn-hover', `linear-gradient(135deg, ${hoverEnd} 0%, ${hoverStart} 100%)`);
        root.style.setProperty('--shadow-glow', `0 0 20px ${color}40`);
    }

    // Apply and load preferences, history
    applyPrefs();
    renderHistory();
});
