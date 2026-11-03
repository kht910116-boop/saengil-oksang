// 점등 순간을 세로 영상으로 녹화해 저장·공유할 수 있게 한다.
// 지원하지 않는 브라우저에서는 아무 일도 하지 않는다.
export function createRecorder(canvas, getAudioStream, onReady) {
  const can = typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function';
  const type = !can ? null : ['video/mp4;codecs=avc3', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  let rec = null;
  let chunks = [];
  let lastBlob = null;

  return {
    supported: !!type,
    get blob() { return lastBlob; },
    get ext() { return type?.startsWith('video/mp4') ? 'mp4' : 'webm'; },
    start() {
      if (!type || rec) return;
      try {
        const stream = canvas.captureStream(30);
        const audio = getAudioStream?.();
        audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
        chunks = [];
        rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5_000_000 });
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        rec.onstop = () => {
          lastBlob = new Blob(chunks, { type: type.split(';')[0] });
          rec = null;
          if (lastBlob.size > 0) onReady?.(lastBlob);
        };
        rec.start(500);
      } catch {
        rec = null;
      }
    },
    stop() {
      if (rec && rec.state !== 'inactive') rec.stop();
    },
  };
}

// 영상 저장: 휴대폰은 공유 시트(인스타 스토리 등)로, 안 되면 파일로 내려받는다
export async function saveVideo(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '오늘의 주인공' });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return 'downloaded';
}

// 캘린더(.ics) 파일: 자정 10분 전에 알림
export function calendarFile({ title, url, at }) {
  const fmt = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//saengil-oksang//KO', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${at}-${Math.random().toString(36).slice(2)}@saengil-oksang`,
    `DTSTAMP:${fmt(Date.now())}`,
    `DTSTART:${fmt(at - 10 * 60_000)}`,
    `DTEND:${fmt(at + 20 * 60_000)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:자정에 다 같이 불을 켜요. ${url}`,
    `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return new Blob([ics], { type: 'text/calendar;charset=utf-8' });
}
