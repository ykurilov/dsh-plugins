# Плагины DeepSeek Harness для учеников

Небольшая подборка плагинов к десктопному DeepSeek Harness: русский интерфейс, баланс,
расход сессии, чистый сайдбар, управление браузером в правой панели и голосовой ввод.
Всё ставится в ваш профиль `desktop` ссылками на эту папку, ничего не публикуется в npm.

Установка — одна команда для агента, который всё сделает за вас:

```bash
node install.mjs --list   # что есть
node install.mjs --plugins=sidebar-balance,session-spend
```

Подробности и порядок действий — в [INSTALL.md](INSTALL.md). Готовый промпт для агента —
в [PROMPT.md](PROMPT.md).

## Что внутри

| id | Что делает | Нужно |
|---|---|---|
| `sidebar-balance` | Баланс аккаунта DeepSeek строкой в подвале сайдбара | вход в аккаунт DeepSeek |
| `session-spend` | Примерный расход денег на текущую сессию под полем ввода | — |
| `sidebar-brandless` | Убирает логотип из верхней части сайдбара и поднимает навигацию | — |
| `panel-dom` | Инструмент `sidebar_browser`: агент открывает страницы в панели «Браузер», читает и кликает | десктопное приложение, не веб-версия |
| `soniox-voice-input` | Кнопка микрофона в поле сообщения, распознавание речи | ключ Soniox, доступ к микрофону |

По умолчанию подборка считается «базовой» без голосового ввода: `sidebar-balance`,
`session-spend`, `sidebar-brandless`, `panel-dom`.

## Требования

- DeepSeek Harness Desktop `0.2.1-rc.5` или новее, профиль `desktop` (создаётся при первом запуске).
- macOS 12+ или Windows 10/11.
- Node не обязателен: если `node` нет в системе, берите его из самого приложения —
  `…/DeepSeek Harness.app/Contents/Resources/runtime/bin/node` (macOS) или
  `%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\bin\node.exe` (Windows).
  Менеджер пакетов тоже берётся из приложения, отдельно ставить pnpm не нужно.

## Что где работает

| Плагин | macOS | Windows |
|---|---|---|
| `sidebar-balance`, `session-spend`, `sidebar-brandless` | да | да |
| `panel-dom` | да | да, включая `screenshot` (снимает через PowerShell) |
| `soniox-voice-input` | да | да, нужно разрешение на микрофон в параметрах Windows |

Единственное место, где раньше был жёстко зашит macOS, — снимок панели в `panel-dom`
(`/usr/sbin/screencapture`). Теперь на Windows он снимается через PowerShell
(`System.Drawing` + DPI-aware), на macOS остался системный `screencapture`.

Честная оговорка: macOS-путь проверен на живом приложении, Windows-код написан и разобран
по шагам, но на реальной Windows не прогонялся. Если снимок панели там не сработает —
остальные 13 действий `sidebar_browser` не затрагиваются, а агент увидит текст ошибки.

## Как это устроено

Каждый плагин — обычный пакет с полем `dsh` (`bundle.patch` и/или `client`). Установщик:

1. находит профиль `~/.dsh/profiles/desktop` (на Windows — `%USERPROFILE%\.dsh\profiles\desktop`);
2. дописывает в его `package.json` зависимости вида `link:<эта папка>/plugins/…`
   и добавляет имена пакетов в `dsh.profile.bundles`;
3. запускает `pnpm install` тем pnpm, который лежит внутри приложения;
4. при ошибке возвращает `package.json` как было.

Перезапуск приложения обязателен: состав бандлов читается на старте. Клиентские половины
плагинов подхватываются при перезагрузке окна (`Cmd+R` / `Ctrl+R`).

Папку репозитория нельзя удалять или переносить: плагины подключены ссылкой.

Удалить поставленное: `node install.mjs --remove=panel-dom`.

## Ограничения

- `panel-dom` работает только в десктопном окне (нужен Electron `<webview>`); в веб-версии
  в браузере панель устроена иначе.
- `soniox-voice-input` без ключа кнопка микрофона покажет сообщение «нет ключа». Ключ кладётся
  в `~/.codex/secrets/soniox-api-key.txt` (Windows: `%USERPROFILE%\.codex\secrets\soniox-api-key.txt`),
  в переменную окружения `SONIOX_API_KEY` или в конфиг плагина (`apiKeyFile`).
- Плагины ничего не отправляют наружу, кроме сетевых запросов самого приложения:
  `soniox` — к Soniox с вашим ключом, `sidebar-balance` — к аккаунту DeepSeek.
