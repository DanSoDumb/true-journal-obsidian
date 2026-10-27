// ---------- recording the live card: a short video, or a GIF ----------

/** Records `seconds` of a canvas that is already being redrawn each frame, preferring a format the device can
 *  mux as MP4 and falling back to WebM when it cannot. Throws if this runtime cannot record canvases at all. */
async function recordCanvasVideo(canvas, seconds, fps = 30) {
  if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') throw new Error('this device cannot record a canvas');
  const stream = canvas.captureStream(fps);
  const candidates = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) throw new Error('this device cannot encode a video');
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve) => { rec.onstop = resolve; });
  rec.start();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  rec.stop();
  await stopped;
  for (const track of stream.getTracks()) track.stop();
  return { blob: new Blob(chunks, { type: mimeType }), ext: mimeType.includes('mp4') ? 'mp4' : 'webm' };
}

