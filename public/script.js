/* ═══════════════════════════════════════════════════════════════
   The Ultimate — Frontend JavaScript
   Handles UI interactions, API communications, and animations.
   ═══════════════════════════════════════════════════════════════ */

// ─── DOM Elements ─────────────────────────────────────────────
const elements = {
  urlInput: document.getElementById('urlInput'),
  btnClear: document.getElementById('btnClear'),
  btnFetch: document.getElementById('btnFetch'),
  previewSection: document.getElementById('previewSection'),
  thumbnail: document.getElementById('thumbnail'),
  videoTitle: document.getElementById('videoTitle'),
  author: document.getElementById('author'),
  duration: document.getElementById('duration'),
  viewCount: document.getElementById('viewCount'),
  btnDownload: document.getElementById('btnDownload'),
  downloadBtnText: document.getElementById('downloadBtnText'),
  downloadBtnIcon: document.getElementById('downloadBtnIcon'),
  qualitySelect: document.getElementById('qualitySelect'),
  formatSelect: document.getElementById('formatSelect'),
  historySection: document.getElementById('historySection'),
  historyList: document.getElementById('historyList'),
  progressBarInner: document.getElementById('progressBarInner'),
  statusSection: document.getElementById('statusSection'),
  statusIcon: document.getElementById('statusIcon'),
  statusText: document.getElementById('statusText'),
  toastContainer: document.getElementById('toastContainer'),
  metadataToggle: document.getElementById('metadataToggle'),
  metadataForm: document.getElementById('metadataForm'),
  editTitle: document.getElementById('editTitle'),
  editArtist: document.getElementById('editArtist')
};

// ─── State ────────────────────────────────────────────────────
let state = {
  currentUrl: '',
  videoData: null,
  isFetching: false,
  isDownloading: false
};

// ─── Quality Options ──────────────────────────────────────────
const qualityOptions = {
  mp3: [
    { val: '320', text: '320 kbps (Best)' },
    { val: '256', text: '256 kbps (High)' },
    { val: '192', text: '192 kbps (Standard)' },
    { val: '128', text: '128 kbps (Basic)' }
  ],
  mp4: [
    { val: '1080', text: '1080p (FHD)' },
    { val: '720', text: '720p (HD)' },
    { val: '480', text: '480p (SD)' },
    { val: '360', text: '360p (Low)' }
  ]
};

// ─── Helper Functions ─────────────────────────────────────────
function isValidYouTubeUrl(url) {
  const pattern = /^(https?:\/\/)?(www\.|music\.)?(youtube\.com|youtu\.be)\/.+/;
  return pattern.test(url);
}

function showToast(message, type = 'error') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function updateQualityOptions() {
  const format = elements.formatSelect.value;
  elements.qualitySelect.innerHTML = '';
  
  if (format === 'mp3') {
    qualityOptions.mp3.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.val;
      option.textContent = opt.text;
      if (opt.val === '192') option.selected = true;
      elements.qualitySelect.appendChild(option);
    });
  } else {
    const res = state.videoData?.availableResolutions || [1080, 720, 480, 360];
    res.forEach(r => {
      const option = document.createElement('option');
      option.value = r;
      option.textContent = `${r}p ${r >= 1080 ? '(HD)' : '(SD)'}`;
      if (r === 720) option.selected = true;
      elements.qualitySelect.appendChild(option);
    });
    if (elements.qualitySelect.selectedIndex === -1 && elements.qualitySelect.options.length > 0) {
      elements.qualitySelect.options[0].selected = true;
    }
  }
}

// ─── Event Handlers ───────────────────────────────────────────
elements.urlInput.addEventListener('input', () => {
  elements.btnClear.classList.toggle('visible', elements.urlInput.value.length > 0);
});

elements.btnClear.addEventListener('click', () => {
  elements.urlInput.value = '';
  elements.btnClear.classList.remove('visible');
  elements.previewSection.classList.add('hidden');
  elements.statusSection.classList.add('hidden');
  elements.urlInput.focus();
});

elements.urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') elements.btnFetch.click();
});

elements.formatSelect.addEventListener('change', updateQualityOptions);

elements.metadataToggle.addEventListener('click', () => {
  elements.metadataForm.classList.toggle('hidden');
  if (!elements.metadataForm.classList.contains('hidden')) {
    elements.editTitle.value = state.videoData?.title || '';
    elements.editArtist.value = state.videoData?.author || '';
  }
});

// ─── API: Fetch Info ──────────────────────────────────────────
elements.btnFetch.addEventListener('click', async () => {
  const url = elements.urlInput.value.trim();

  if (!url) {
    showToast('Please paste a link first!', 'error');
    elements.urlInput.focus();
    return;
  }

  if (!isValidYouTubeUrl(url)) {
    showToast('Invalid YouTube URL. Please check and try again.', 'error');
    return;
  }

  elements.btnFetch.classList.add('loading');
  elements.btnFetch.disabled = true;
  elements.previewSection.classList.add('hidden');
  showToast('🔍 Analyzing video URL...', 'info');

  try {
    const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Failed to fetch video info');

    state.currentUrl = url;
    state.videoData = data.data;

    // Populate UI
    elements.thumbnail.src = data.data.thumbnail;
    elements.videoTitle.textContent = data.data.title;
    elements.author.textContent = data.data.author;
    elements.duration.textContent = data.data.duration;
    elements.viewCount.textContent = data.data.viewCount;

    elements.previewSection.classList.remove('hidden');
    updateQualityOptions();
    showToast('Information captured successfully!', 'success');

  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    elements.btnFetch.classList.remove('loading');
    elements.btnFetch.disabled = false;
  }
});

// ─── API: Download ────────────────────────────────────────────
elements.btnDownload.addEventListener('click', async () => {
  if (!state.currentUrl) return;

  const quality = elements.qualitySelect.value;
  const format = elements.formatSelect.value;
  const title = elements.editTitle.value.trim();
  const artist = elements.editArtist.value.trim();

  elements.btnDownload.disabled = true;
  elements.btnDownload.classList.add('processing');
  elements.downloadBtnText.textContent = 'Processing...';
  if (elements.downloadBtnIcon) elements.downloadBtnIcon.className = 'fa-solid fa-circle-notch fa-spin';

  elements.statusSection.classList.remove('hidden');
  elements.statusText.textContent = `Preparing your ${format.toUpperCase()}...`;
  showToast(`🚀 Starting ${format.toUpperCase()} download...`, 'info');
  
  let progress = 0;
  elements.progressBarInner.style.width = '0%';
  const progressInterval = setInterval(() => {
    if (progress < 90) {
      progress += Math.random() * 5;
      elements.progressBarInner.style.width = `${Math.min(progress, 90)}%`;
    }
  }, 500);

  try {
    let fetchUrl = `/api/download?url=${encodeURIComponent(state.currentUrl)}&quality=${quality}&format=${format}`;
    if (title) fetchUrl += `&customTitle=${encodeURIComponent(title)}`;
    if (artist) fetchUrl += `&customArtist=${encodeURIComponent(artist)}`;
    
    // console.log(`[The Ultimate] Requesting download: ${fetchUrl}`);
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error('Download failed. Please try again later.');

    const blob = await response.blob();
    clearInterval(progressInterval);
    elements.progressBarInner.style.width = '100%';

    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${title || state.videoData.title}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    showToast('Download started!', 'success');
    elements.statusText.textContent = 'Success! Your file is ready.';
    
    addToHistory({
      url: state.currentUrl,
      title: state.videoData.title,
      thumbnail: state.videoData.thumbnail,
      author: state.videoData.author,
      timestamp: Date.now()
    });

    setTimeout(() => {
      elements.statusSection.classList.add('hidden');
      elements.progressBarInner.style.width = '0%';
      loadHistory();
    }, 4000);

  } catch (error) {
    clearInterval(progressInterval);
    elements.progressBarInner.style.width = '0%';
    elements.statusText.textContent = 'Something went wrong. Let\'s try again.';
    showToast(error.message, 'error');
  } finally {
    elements.btnDownload.disabled = false;
    elements.btnDownload.classList.remove('processing');
    elements.downloadBtnText.textContent = 'Download Now';
    if (elements.downloadBtnIcon) elements.downloadBtnIcon.className = 'fa-solid fa-cloud-arrow-down';
  }
});

// ─── History Logic ───────────────────────────────────────────
function addToHistory(item) {
  let history = JSON.parse(localStorage.getItem('the_ultimate_history') || '[]');
  history = history.filter(h => h.url !== item.url);
  history.unshift(item);
  localStorage.setItem('the_ultimate_history', JSON.stringify(history.slice(0, 5)));
}

function loadHistory() {
  const history = JSON.parse(localStorage.getItem('the_ultimate_history') || '[]');
  if (history.length === 0) {
    elements.historySection.classList.add('hidden');
    return;
  }

  elements.historySection.classList.remove('hidden');
  elements.historyList.innerHTML = '';

  history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <img src="${item.thumbnail}" alt="" class="history-thumb">
      <div class="history-info">
        <div class="history-title" title="${item.title}">${item.title}</div>
        <div class="history-meta">${item.author}</div>
      </div>
      <div class="btn-history-dl"><i class="fa-solid fa-redo"></i></div>
    `;
    div.addEventListener('click', () => {
      elements.urlInput.value = item.url;
      elements.btnFetch.click();
    });
    elements.historyList.appendChild(div);
  });
}

// ─── Background Animation ─────────────────────────────────────
(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 2 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.speedY = (Math.random() - 0.5) * 0.3;
      this.opacity = Math.random() * 0.5;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
      if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(139, 92, 246, ${this.opacity})`;
      ctx.fill();
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', resize);
  resize();
  particles = Array.from({ length: 60 }, () => new Particle());
  animate();
})();

// ─── Initialization ───────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  elements.urlInput.focus();
  loadHistory();
});
