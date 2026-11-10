function extractActivePageDom() {
  const title = (document.title || '').trim();
  const descEl = document.querySelector('meta[name="description"]');
  const description = descEl ? (descEl.getAttribute('content') || '').trim() : '';
  const canonicalEl = document.querySelector('link[rel="canonical"]');
  const canonical = canonicalEl ? (canonicalEl.getAttribute('href') || '').trim() : '';

  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).slice(0, 80).map(el => ({
    level: Number(el.tagName.slice(1)),
    text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  })).filter(h => h.text.length > 0);

  const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 150).map(a => {
    const rawHref = (a.getAttribute('href') || '').trim();
    const anchor = (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    return { href: rawHref, anchor };
  }).filter(l => l.href.length > 0);

  const images = Array.from(document.querySelectorAll('img')).slice(0, 100);
  const missingAltCount = images.filter(img => !img.hasAttribute('alt')).length;

  const paragraphs = Array.from(document.querySelectorAll('main p, article p, p')).slice(0, 60)
    .map(p => (p.innerText || p.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const markdownLines = [];
  for (const h of headings) {
    markdownLines.push(`${'#'.repeat(h.level)} ${h.text}`);
  }
  for (const p of paragraphs.slice(0, 25)) {
    markdownLines.push(p);
  }
  for (const l of links.slice(0, 40)) {
    if (l.href.startsWith('/') || l.href.startsWith(location.origin)) {
      markdownLines.push(`[${l.anchor || l.href}](${l.href})`);
    }
  }

  return {
    url: location.href,
    origin: location.origin,
    title,
    description,
    canonical,
    headings,
    linksCount: links.length,
    imagesCount: images.length,
    missingAltCount,
    packet: {
      schemaVersion: 1,
      locale: document.documentElement.lang?.toLowerCase().startsWith('en') ? 'en' : 'ru',
      market: '',
      primaryQuery: '',
      readerTask: '',
      article: {
        title,
        description,
        renderedH1: headings.find(h => h.level === 1)?.text || '',
        h1Mode: 'markdown',
        markdown: markdownLines.join('\n\n') || title || 'Empty document'
      },
      sources: [],
      claims: [],
      glossary: [],
      reviewedSections: []
    }
  };
}

function evaluateDomSnapshot(snapshot) {
  const findings = [];
  const h1List = snapshot.headings.filter(h => h.level === 1);
  if (!snapshot.title) {
    findings.push({ severity: 'warning', code: 'title-not-provided', message: 'Отсутствует тег <title>.' });
  }
  if (!snapshot.description) {
    findings.push({ severity: 'warning', code: 'description-not-provided', message: 'Отсутствует meta[name="description"].' });
  }
  if (h1List.length !== 1) {
    findings.push({ severity: 'error', code: 'h1-count', message: `Найдено заголовков H1: ${h1List.length} (ожидается 1).` });
  }
  let previousLevel = 0;
  for (const h of snapshot.headings) {
    if (previousLevel > 0 && h.level > previousLevel + 1) {
      findings.push({ severity: 'warning', code: 'heading-level-gap', message: `Скачок уровня заголовка H${previousLevel} -> H${h.level} («${h.text.slice(0, 60)}»).` });
    }
    previousLevel = h.level;
  }
  if (snapshot.missingAltCount > 0) {
    findings.push({ severity: 'warning', code: 'missing-image-alt', message: `Изображений без атрибута alt: ${snapshot.missingAltCount} из ${snapshot.imagesCount} (пустой alt="" допустим для декоративных изображений).` });
  }
  return findings;
}

let latestPacketJson = '';
const inspectBtn = document.getElementById('inspect-btn');
const copyBtn = document.getElementById('copy-packet-btn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const metricsEl = document.getElementById('metrics');
const findingsEl = document.getElementById('findings');

inspectBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Чтение DOM активной вкладки…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      statusEl.textContent = 'Активная вкладка недоступна.';
      return;
    }
    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractActivePageDom
    });
    const snapshot = injection?.[0]?.result;
    if (!snapshot) {
      statusEl.textContent = 'Не удалось прочитать DOM этой вкладки.';
      return;
    }
    latestPacketJson = JSON.stringify(snapshot.packet, null, 2);
    copyBtn.disabled = false;
    const findings = evaluateDomSnapshot(snapshot);
    resultsEl.hidden = false;
    metricsEl.replaceChildren();
    for (const [val, label] of [
      [snapshot.headings.length, 'Заголовков'],
      [snapshot.linksCount, 'Ссылок'],
      [findings.length, 'Замечаний']
    ]) {
      const box = document.createElement('div');
      box.className = 'rl-ext-metric';
      const st = document.createElement('strong');
      st.textContent = String(val);
      const sp = document.createElement('span');
      sp.textContent = label;
      box.append(st, sp);
      metricsEl.append(box);
    }
    findingsEl.replaceChildren();
    if (!findings.length) {
      const ok = document.createElement('li');
      ok.textContent = 'Структурных ошибок по заголовкам, title, description и alt не обнаружено.';
      findingsEl.append(ok);
    } else {
      for (const f of findings) {
        const li = document.createElement('li');
        li.dataset.sev = f.severity;
        li.textContent = `[${f.code}] ${f.message}`;
        findingsEl.append(li);
      }
    }
    statusEl.textContent = 'Проверка завершена. Вы можете скопировать пакет для терминала Reproleaf.';
  } catch (err) {
    statusEl.textContent = 'Браузер не разрешил доступ к системной вкладке.';
  }
});

copyBtn.addEventListener('click', async () => {
  if (!latestPacketJson) return;
  try {
    await navigator.clipboard.writeText(latestPacketJson);
    statusEl.textContent = 'JSON-пакет скопирован в буфер обмена.';
  } catch {
    statusEl.textContent = 'Не удалось скопировать в буфер обмена.';
  }
});
