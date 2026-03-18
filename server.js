const express = require('express');
const cors = require('cors');
const { YtDlp, helpers } = require('ytdlp-nodejs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const { PassThrough } = require('stream');

// Initialize yt-dlp wrapper
const ytdlp = new YtDlp();

// Ensure yt-dlp binary is downloaded if not present
(async () => {
  try {
    console.log('Checking yt-dlp installation...');
    await helpers.downloadYtDlp();
    console.log('yt-dlp is ready.');
  } catch(e) {
    console.error('Warning: Failed to auto-download yt-dlp binary', e);
  }
})();

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helper: validate YouTube URL ───────────────────────────────
function isValidYouTubeUrl(url) {
  // Broad pattern to support all YouTube/YT Music variations
  const pattern = /^(https?:\/\/)?(www\.|music\.)?(youtube\.com|youtu\.be)\/.+/;
  return pattern.test(url);
}

// ─── Helper: format duration ────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ─── API: Get Video Info ────────────────────────────────────────
app.get('/api/info', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url || !isValidYouTubeUrl(url)) {
      return res.status(400).json({
        error: 'Please provide a valid YouTube or YT Music link.'
      });
    }

    // Fetch info with enhanced resilient flags
    // console.log(`Fetching info for: ${url}`);
    const info = await ytdlp.getInfoAsync(url, [
      '--no-check-certificates',
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=ios,mweb',
      '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
      '--ignore-errors',
      '--no-playlist'
    ]);
    
    if (!info || !info.title) {
        throw new Error('Could not retrieve video details. The content might be private or restricted.');
    }

    // Stable artist extraction
    const author = info.artist || info.creator || info.uploader || 'Unknown';
    
    // Safely extract resolutions
    let resolutions = [1080, 720, 480, 360];
    if (info.formats && Array.isArray(info.formats)) {
      const found = [...new Set(info.formats
        .filter(f => f.vcodec !== 'none' && f.height)
        .map(f => f.height))]
        .sort((a, b) => b - a);
      if (found.length > 0) resolutions = found;
    }

    res.json({
      success: true,
      data: {
        title: info.title || 'Untitled',
        author: author,
        duration: formatDuration(info.duration || 0),
        thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails.length > 0 ? info.thumbnails[info.thumbnails.length - 1].url : ''),
        viewCount: (info.view_count || 0).toLocaleString(),
        videoId: info.id,
        availableResolutions: resolutions
      }
    });
  } catch (error) {
    console.error('Info Error Details:', error);
    const cleanError = error.message?.split('\n')[0] || 'Failed to fetch video information.';
    res.status(500).json({ 
        error: `${cleanError} The video may be restricted, private, or YouTube might be blocking the request.` 
    });
  }
});

// ─── API: Update yt-dlp ─────────────────────────────────────────
app.get('/api/update', async (req, res) => {
    try {
        // console.log('Updating yt-dlp binary...');
        await helpers.downloadYtDlp();
        res.json({ success: true, message: 'yt-dlp binary updated successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update binary: ' + error.message });
    }
});

const fs = require('fs');

// ─── API: Download Audio as MP3 ─────────────────────────────────
app.get('/api/download', async (req, res) => {
  try {
    const { url, quality = '192', format = 'mp3', customTitle, customArtist } = req.query;

    if (!url || !isValidYouTubeUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL.' });
    }

    const isVideo = format === 'mp4';
    let audioQuality = quality;
    
    if (!isVideo) {
      const qualityMap = { '320': '320K', '256': '256K', '192': '192K', '128': '128K' };
      audioQuality = qualityMap[quality] || '192K';
    }

    const info = await ytdlp.getInfoAsync(url, [
      '--no-check-certificates',
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=ios,mweb',
      '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1'
    ]);
    const finalTitle = customTitle || info.title;
    const finalArtist = customArtist || (info.artist || info.creator || info.uploader);
    
    const safeTitle = (finalTitle || 'Download').replace(/[^\w\s-]/g, '').trim();

    const tempDir = path.join(__dirname, 'temp_downloads');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.${isVideo ? 'mp4' : 'mp3'}"`);
    res.setHeader('Content-Type', isVideo ? 'video/mp4' : 'audio/mpeg');

    // console.log(`Download request: ${url}, format: ${format}, quality: ${quality}`);
    
    // Run the download process with resilient flags
    let downloadBuilder = ytdlp.download(url)
      .addArgs('--no-check-certificates')
      .addArgs('--ffmpeg-location', ffmpegStatic);

    if (isVideo) {
      const resLimit = quality || '720';
      // console.log(`[DOWNLOAD] MP4 Mode - URL: ${url}, Target Resolution: ${resLimit}p`);
      
      downloadBuilder = downloadBuilder
        .addArgs('-f', `bv*[height<=${resLimit}][ext=mp4]+ba[ext=m4a]/bv*[height<=${resLimit}]+ba/b[height<=${resLimit}]`)
        .addArgs('--merge-output-format', 'mp4');
    } else {
      downloadBuilder = downloadBuilder
        .addArgs('--extractor-args', 'youtube:player_client=ios,mweb')
        .addArgs('--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1')
        .format({ filter: 'audioonly' })
        .addArgs('-x', '--audio-format', 'mp3', '--audio-quality', audioQuality)
        .addArgs('--metadata-from-title', '%(artist)s - %(title)s')
        .addArgs('--postprocessor-args', `ffmpeg:-metadata title="${finalTitle}" -metadata artist="${finalArtist}"`)
        .embedThumbnail()
        .embedMetadata();
    }

    const result = await downloadBuilder
      .output(path.join(tempDir, `%(id)s_%(epoch)s.%(ext)s`))
      .run();

    if (result && result.filePaths && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];

      // Stream the file to the user
      const fileStream = fs.createReadStream(filePath);
      
      fileStream.pipe(res);

      let cleanedUp = false;
      // Helper to clean up all files related to this download
      const cleanupFiles = () => {
        if (cleanedUp || !info.id) return;
        cleanedUp = true;
        
        // Wait 1 second to ensure Windows file handles are completely released
        setTimeout(() => {
          fs.readdir(tempDir, (err, files) => {
            if (err) return;
            files.forEach(file => {
              if (file.includes(info.id)) {
                fs.rm(path.join(tempDir, file), { recursive: true, force: true }, (e) => {
                  if (e) console.error('Failed to delete temp item:', e.message);
                });
              }
            });
          });
        }, 1000);
      };

      fileStream.on('error', (err) => {
        console.error('File Stream Error:', err.message);
        if (!res.headersSent) {
          try { res.status(500).json({ error: 'Failed to send file.' }); } catch (e) {}
        }
        cleanupFiles();
      });

      // Handle successful transfer
      fileStream.on('close', () => {
         cleanupFiles();
      });

      req.on('close', () => {
         if (!fileStream.destroyed) fileStream.destroy();
         cleanupFiles();
      });

    } else {
      throw new Error('Download failed, no file paths returned.');
    }

  } catch (error) {
    console.error('Download Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to download audio with metadata. Please try again.'
      });
    }
  }
});

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start Server ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   🎵 YouTube Audio Downloader Server    ║
  ║   Running on http://localhost:${PORT}       ║
  ╚══════════════════════════════════════════╝
  `);
});
