---
title: "Детерминированный GEO и аудит llms.txt без магии ИИ: разбор архитектуры Reproleaf"
hubs: "SEO, JavaScript, Open Source"
tags: "seo, geo, llms-txt, ai-search, open-source, node-js"
canonical: "https://evolkov.tech/tools/geo-llms-budget-case"
---

## Почему автоматический SEO-аудит ломается без строгой схемы

Большинство публичных SEO-чекеров либо просят подписку за базовые проверки, либо отправляют ваш черновик во внешнюю LLM. Первый вариант не масштабируется для соло-проектов, второй даёт невоспроизводимый ответ при каждом запуске.

Мы в open-source проекте [Reproleaf](https://github.com/vei66rus/reproleaf) описали каждую проверку строгой схемой Zod и чистой функцией. Одни и те же данные всегда дают одинаковый отчёт в терминале, в MCP-клиенте и в браузере.

## Как устроен контроль AI-краулеров и `llms.txt`

AI-поисковики и LLM-клиенты ориентируются на два базовых файла: `robots.txt` и `llms.txt`. Ошибка в одной строке `Disallow` или раздутый `llms.txt` исключают документацию из контекстного окна модели.

Вместо абстрактных советов инструмент разбирает правила построчно и считает бюджет токенов в нескольких кодировках.

- Проверяет доступ для `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot` и `Google-Extended` через [GEO Readiness Checker](https://evolkov.tech/tools/geo-readiness-checker).
- Валидирует синтаксис `llms.txt`, находит битые относительные ссылки и считает объём `llms-full.txt` в [llms.txt Studio](https://evolkov.tech/tools/llms-txt-studio).
- Воспроизводит те же проверки в CI одной командой без сети.

```bash
npx reproleaf llms-txt audit --file llms.txt
npx reproleaf llms-budget-audit --file budget-input.json
npx reproleaf geo-audit --file geo-input.json
```

## Answer-First и проверка терминологии без галлюцинаций

AI Overviews и RAG-системы извлекают короткие самодостаточные фрагменты текста после каждого подзаголовка. Длинные шаблонные вступления резко снижают вероятность прямого цитирования ответа.

Модуль `answer-first-audit` измеряет длину первого абзаца под каждым заголовком, выявляет вводную воду и проверяет структуру списков. Браузерный [Editorial Clarity Linter](https://evolkov.tech/tools/editorial-clarity-linter) запускает те же проверки локально без отправки текста на сервер.

```bash
npx reproleaf answer-first-audit --file article.md
npx reproleaf clarity-audit --file article.md
```

## Реальные цифры спроса и разделение RU/EN-посадочных

Перед публикацией пяти новых браузерных инструментов на `evolkov.tech` мы сняли частотности через DataForSEO Labs по США (`2840`, EN) и русскоязычной выдаче (`2804`, RU).

По данным выгрузки спрос концентрируется вокруг прикладных задач. Для проверки `generative engine optimization tool` зафиксировано 880 запросов в месяц, `llms.txt generator` набирает 390, `llms full txt` — 170, `ai citation checker` — 140, `serp preview tool` — 110.

Чтобы 16 русских и 16 английских посадочных страниц не конкурировали по `Title` и целевым запросам, граф проверили матрицей каннибализации. Оба кластера показали ноль пересечений. Воспроизвести аудит можно в [Cocoon & Cannibalization Matrix](https://evolkov.tech/tools/cocoon-matrix-checker).

```bash
npx reproleaf cannibalization-audit --file pages.json
npx reproleaf cocoon-audit --file inventory.json
```

## Что уже работает в браузере и на локальной машине

Клиентская часть Reproleaf разбита на динамические ES-чанки, а базовый загрузчик весит 1134 байта и подгружает виджет только по требованию. Все пять инструментов работают в браузере бесплатно и без отправки черновиков на сервер.

- [SERP Pixel Preview](https://evolkov.tech/tools/serp-pixel-preview) — проверка пиксельной ширины сниппета.
- [llms.txt Studio](https://evolkov.tech/tools/llms-txt-studio) — валидация и бюджет токенов `llms.txt`.
- [GEO Readiness Checker](https://evolkov.tech/tools/geo-readiness-checker) — контроль AI-ботов и Answer-First.
- [Editorial Clarity Linter](https://evolkov.tech/tools/editorial-clarity-linter) — поиск канцелярита и перегруженных абзацев.
- [Cocoon Matrix](https://evolkov.tech/tools/cocoon-matrix-checker) — матрица каннибализации и внутренней перелинковки.

Исходный код для CLI и MCP открыт в репозитории [vei66rus/reproleaf](https://github.com/vei66rus/reproleaf).
