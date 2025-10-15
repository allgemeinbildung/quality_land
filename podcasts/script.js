document.addEventListener('DOMContentLoaded', () => {
    // ---------- DOM ----------
    let audioPlayer = document.getElementById('audio-player');
    const playerContainer = document.getElementById('player-container');
    const slideDisplay = document.getElementById('slide-display');
    const slideImageContainer = document.getElementById('slide-image-container');
    const slideTextContainer = document.getElementById('slide-text-container');
    const slideTextContent = document.getElementById('slide-text-content') || slideTextContainer;
    const sourceLinkWrap = document.getElementById('source-link-wrap');
    const zoomHintEl = document.getElementById('zoom-hint');
    const tocList = document.getElementById('toc-list');
    const tocToggleBtn = document.getElementById('toc-toggle-btn');

    // ---------- STATE ----------
    let slidesData = [];
    let currentSlideIndex = -1;
    let hideControlsTimeout;
    let textAnimationTimeout;
    let tocCollapseTimer = null;

    // ---------- UTILS ----------
    const getIdFromUrl = () => new URLSearchParams(location.search).get('Id') || 'test2';

    function parseTimestamp(ts) {
        const parts = String(ts).replace(':', '_').split('_');
        const minutes = parseInt(parts[0], 10) || 0;
        const seconds = parseInt(parts[1], 10) || 0;
        return (minutes * 60) + seconds;
    }

    const escapeHTML = (s) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');

    function formatMarkdownText(text) {
        let t = escapeHTML(text ?? '');
        t = t.replace(/ß/g, 'ss');
        t = t.replace(/\n/g, '<br>');
        t = t.replace(/\*\*(.*?)\*\*/g, '<strong class="bold-text">$1</strong>');
        t = t.replace(/(^|[\s(])\*(.*?)\*(?=[\s).,!?:;]|$)/g, '$1<em class="italic-text">$2</em>');
        return t;
    }

    // ---------- RENDER ----------
    function renderSlide(slideIndex) {
        if (slideIndex === -1 || !slidesData[slideIndex]) {
            slideImageContainer.innerHTML = '';
            slideTextContent.innerHTML = '<p style="align-self:center; text-align:center;">Presentation loading...</p>';
            fitTextBlock();
            return;
        }

        const slide = slidesData[slideIndex];
        const id = getIdFromUrl();
        const imagePath = `/images/${id}/${slide.index + 1}.png`;

        slideImageContainer.innerHTML =
            `<img src="${imagePath}" alt="${escapeHTML(slide.concept)}"
                onerror="this.style.display='none'; this.parentElement.innerHTML='<p>Image not found.</p>';">`;

        const allLines = String(slide.slide_content || '').split('\n');
        const bulletLines = allLines.slice(1).slice(0, 4);

        const bulletsHtml = bulletLines
            .map(line => `<p class="list-item">${formatMarkdownText(line.replace(/^\s*-\s*/, ''))}</p>`)
            .join('');

        slideTextContent.innerHTML = `
            <p class="explanation-callout">${formatMarkdownText(slide.explanation)}</p>
            ${bulletsHtml}
        `;

        slideDisplay.classList.remove('reverse');
        requestAnimationFrame(fitTextBlock);
    }

    // --- MODIFIED: Animation functions now accept dynamic delays ---

    function startTextAnimation(slide) {
        clearTimeout(textAnimationTimeout);
        const explanationElement = slideTextContent.querySelector('.explanation-callout');
        const bulletElements = slideTextContent.querySelectorAll('.list-item');
        if (!explanationElement) return;

        // Determine delays based on slide duration
        const slideDuration = slide.duration || 30; // Default to 30s if duration not calculated
        let initialBulletDelay = 5000;
        let staggerDelay = 5000;

        if (slideDuration > 30) {
            initialBulletDelay = 10000;
            staggerDelay = 10000;
        }

        // Animate explanation text almost immediately
        textAnimationTimeout = setTimeout(() => {
            explanationElement.classList.add('visible');

            // If there are bullets, start their animation after the calculated initial delay
            if (bulletElements.length > 0) {
                textAnimationTimeout = setTimeout(() => {
                    animateBullet(0, bulletElements, staggerDelay);
                }, initialBulletDelay);
            }
        }, 200);
    }

    function animateBullet(index, elements, staggerDelay) {
        if (index >= elements.length) return;
        elements[index].classList.add('visible');
        textAnimationTimeout = setTimeout(() => animateBullet(index + 1, elements, staggerDelay), staggerDelay);
    }

    function fitTextBlock() {
        if (!slideTextContainer || !slideTextContent) return;
        slideTextContent.style.transform = 'scale(1)';
        slideTextContent.style.width = 'auto';
        const containerW = slideTextContainer.clientWidth;
        const containerH = slideTextContainer.clientHeight;
        const contentW = slideTextContent.scrollWidth;
        const contentH = slideTextContent.scrollHeight;
        if (containerW <= 0 || containerH <= 0 || contentW <= 0 || contentH <= 0) return;
        const scaleW = containerW / contentW;
        const scaleH = containerH / contentH;
        let scale = Math.min(scaleW, scaleH, 1);
        if (scale < 0.5) scale = 0.5;
        slideTextContent.style.transform = `scale(${scale})`;
        slideTextContent.style.width = `${(1 / scale) * 100}%`;
    }

    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(fitTextBlock));
    resizeObserver.observe(slideDisplay);
    resizeObserver.observe(slideTextContainer);

    // ---------- AUDIO ----------
    function attachBasicAudioListeners(aEl) {
        aEl.addEventListener('timeupdate', () => updateSlide(aEl.currentTime));
        aEl.addEventListener('seeking', () => updateSlide(aEl.currentTime));

        aEl.addEventListener('play', () => {
            resetHideControlsTimer();
            clearTimeout(tocCollapseTimer);
            tocCollapseTimer = setTimeout(() => {
                if (!playerContainer.classList.contains('toc-collapsed')) {
                    playerContainer.classList.add('toc-collapsed');
                }
            }, 10000);
        });
        
        aEl.addEventListener('pause', () => {
            clearTimeout(hideControlsTimeout);
            showControls();
        });
    }

    function replaceAudioElementWithClone() {
        const clone = audioPlayer.cloneNode(true);
        audioPlayer.parentNode.replaceChild(clone, audioPlayer);
        audioPlayer = document.getElementById('audio-player');
        attachBasicAudioListeners(audioPlayer);
    }

    function tryLocalFallback(baseName) {
        const a = audioPlayer;
        const exts = ['.mp3', '.m4a', '.wav', '.mp4'];
        let i = 0;
        const tryNext = () => {
            i++;
            if (i < exts.length) {
                a.src = `/audio/${baseName}${exts[i]}`; a.load();
            } else {
                console.error(`No local audio found for '${baseName}'.`);
                slideTextContent.innerHTML = `<p style="color:red;">Audio konnte nicht geladen werden.</p>`;
            }
            requestAnimationFrame(fitTextBlock);
        };
        a.addEventListener('error', tryNext);
        a.addEventListener('canplay', () => a.removeEventListener('error', tryNext), { once: true });
        a.src = `/audio/${baseName}${exts[i]}`;
        a.load();
    }

    function setAudioSourceFromConfigOrLocal(mp3Url, id) {
        replaceAudioElementWithClone();
        const a = audioPlayer;
        if (mp3Url && typeof mp3Url === 'string' && mp3Url.trim() !== '') {
            const onError = () => {
                console.warn('Remote audio error');
                a.removeEventListener('error', onError);
                tryLocalFallback(id);
            };
            a.addEventListener('error', onError, { once: true });
            a.src = mp3Url.trim();
            a.load();
        } else {
            tryLocalFallback(id);
        }
    }

    // ---------- SLIDES & TOC LOGIC ----------
    function updateSlide(currentTime) {
        let slideToShowIndex = -1;
        for (let i = 0; i < slidesData.length; i++) {
            if (currentTime >= slidesData[i].timestamp) slideToShowIndex = i;
            else break;
        }

        if (slideToShowIndex !== currentSlideIndex) {
            const isInitialLoad = currentSlideIndex === -1;
            clearTimeout(textAnimationTimeout);

            const updateAndShow = () => {
                currentSlideIndex = slideToShowIndex;
                const currentSlide = slidesData[currentSlideIndex];
                
                renderSlide(currentSlideIndex);
                updateActiveTOCItem();

                setTimeout(() => {
                    // Pass the current slide object to the animation function
                    if (currentSlide) {
                        startTextAnimation(currentSlide);
                    }
                    requestAnimationFrame(fitTextBlock);
                }, isInitialLoad ? 50 : 400);
            };

            setTimeout(updateAndShow, isInitialLoad ? 30 : 150);
        }
    }

    function populateTOC() {
        tocList.innerHTML = '';
        slidesData.forEach((slide) => {
            const chapter = document.createElement('div');
            chapter.className = 'toc-item';
            chapter.textContent = slide.concept || `Slide ${slide.index + 1}`;
            chapter.dataset.index = slide.index;
            chapter.addEventListener('click', () => {
                audioPlayer.currentTime = slide.timestamp;
            });
            tocList.appendChild(chapter);
        });
    }

    function updateActiveTOCItem() {
        document.querySelectorAll('.toc-item').forEach(item => {
            if (parseInt(item.dataset.index, 10) === currentSlideIndex) {
                item.classList.add('active');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    // --- (UI and Hint functions are unchanged) ---
    function setZoomHintText() {
        if (!zoomHintEl) return;
        const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent);
        const minus = isApple ? '⌘−' : 'Ctrl−';
        const reset = isApple ? '⌘0' : 'Ctrl+0';
        zoomHintEl.textContent = `Tipp: Browser-Zoom verkleinern (${minus}). Zurücksetzen: ${reset}.`;
    }
    function showControls() { audioPlayer.classList.remove('hidden'); }
    function hideControls() { audioPlayer.classList.add('hidden'); }
    function resetHideControlsTimer() {
        clearTimeout(hideControlsTimeout);
        showControls();
        hideControlsTimeout = setTimeout(hideControls, 2500);
    }
    document.getElementById('slide-display').addEventListener('mousemove', resetHideControlsTimer);
    document.getElementById('slide-display').addEventListener('mouseleave', () => {
        hideControlsTimeout = setTimeout(hideControls, 400);
    });

    // ---------- INIT ----------
    (async function initializePlayer() {
        setZoomHintText();

        tocToggleBtn.addEventListener('click', () => {
            clearTimeout(tocCollapseTimer);
            playerContainer.classList.toggle('toc-collapsed');
        });

        const id = getIdFromUrl();
        const slidesFile = `${id}.json`;

        try {
            const response = await fetch(`/json/${slidesFile}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const rawData = await response.json();
            const { source, entries, mp3 } = rawData;

            if (sourceLinkWrap) {
                if (source) {
                    sourceLinkWrap.innerHTML = `👉 <a href="${source}" target="_blank" rel="noopener noreferrer">Link</a>`;
                } else {
                    sourceLinkWrap.textContent = '–';
                }
            }

            setAudioSourceFromConfigOrLocal(mp3, id);

            // NEW: Wait for audio metadata to load before calculating durations
            audioPlayer.addEventListener('loadedmetadata', () => {
                const audioDuration = audioPlayer.duration;

                slidesData = (entries || [])
                    .map((item, index) => ({
                        ...item,
                        index,
                        timestamp: parseTimestamp(item.timestamp),
                    }))
                    .sort((a, b) => a.timestamp - b.timestamp);
                
                // NEW: Loop through sorted slides to calculate duration for each one
                slidesData.forEach((slide, index) => {
                    if (index < slidesData.length - 1) {
                        // Duration is the time until the next slide starts
                        slide.duration = slidesData[index + 1].timestamp - slide.timestamp;
                    } else {
                        // Duration of the last slide is until the end of the audio
                        slide.duration = audioDuration - slide.timestamp;
                    }
                });

                populateTOC();
                updateSlide(audioPlayer.currentTime);
            });

        } catch (error) {
            console.error("Error loading presentation data:", error);
            slideTextContent.innerHTML = `<p style="color:red;">Fehler: Konnte die Slides nicht laden (${escapeHTML(slidesFile)}).</p>`;
            if (sourceLinkWrap) sourceLinkWrap.textContent = '–';
            setAudioSourceFromConfigOrLocal(null, getIdFromUrl());
            requestAnimationFrame(fitTextBlock);
        }

        attachBasicAudioListeners(audioPlayer);
        resetHideControlsTimer();
        requestAnimationFrame(fitTextBlock);
    })();
});