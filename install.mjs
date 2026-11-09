#!/usr/bin/env node
/**
 * Установщик подборки плагинов DeepSeek Harness в профиль пользователя.
 *
 * Запуск (Node 18+; подойдёт и Node из рантайма самого DeepSeek Harness):
 *   node install.mjs --list
 *   node install.mjs --plugins=sidebar-balance,session-spend
 *   node install.mjs --all
 *   node install.mjs --plugins=panel-dom --dry-run
 *
 * Что делает:
 *   1. находит домашнюю папку DSH (~/.dsh или %USERPROFILE%\.dsh) и профиль desktop;
 *   2. дописывает в package.json профиля link-зависимости и bundles;
 *   3. ставит их менеджером пакетов, который лежит внутри приложения DSH;
 *   4. при ошибке возвращает package.json как было.
 *
 * После установки приложение нужно перезапустить: состав плагинов читается на старте.
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, lstatSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Каталог репозитория: рядом с этим скриптом. */
const REPO = resolve(HERE)

function parseArgs(argv) {
  const options = {
    plugins: [],
    remove: [],
    all: false,
    list: false,
    dryRun: false,
    json: false,
    profile: 'desktop',
    dshHome: process.env.DSH_HOME || join(homedir(), '.dsh'),
    pnpm: process.env.DSH_PNPM_JS || '',
  }
  for (const arg of argv) {
    if (arg === '--all') options.all = true
    else if (arg === '--list') options.list = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--json') options.json = true
    else if (arg.startsWith('--plugins=')) options.plugins = arg.slice('--plugins='.length).split(',').map((id) => id.trim()).filter(Boolean)
    else if (arg.startsWith('--remove=')) options.remove = arg.slice('--remove='.length).split(',').map((id) => id.trim()).filter(Boolean)
    else if (arg.startsWith('--profile=')) options.profile = arg.slice('--profile='.length)
    else if (arg.startsWith('--dsh-home=')) options.dshHome = arg.slice('--dsh-home='.length)
    else if (arg.startsWith('--pnpm=')) options.pnpm = arg.slice('--pnpm='.length)
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Неизвестный аргумент: ${arg}`)
  }
  return options
}

function readCatalog() {
  const raw = readFileSync(join(REPO, 'plugins.json'), 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed.plugins)) throw new Error('plugins.json: нет массива plugins')
  return parsed.plugins
}

function printList(catalog) {
  console.log('Доступные плагины:\n')
  for (const plugin of catalog) {
    const mark = plugin.default ? ' (по умолчанию)' : ''
    console.log(`  ${plugin.id}${mark}`)
    console.log(`    ${plugin.title} — ${plugin.summary}`)
    if (plugin.requires.length > 0) console.log(`    Нужно: ${plugin.requires.join('; ')}`)
    console.log('')
  }
  console.log('Поставить: node install.mjs --plugins=id1,id2   (или --all)')
  console.log('Убрать:    node install.mjs --remove=id1,id2')
}

/** `link:`-путь, который понимает pnpm на macOS, Windows и Linux. */
function linkSpec(absolutePath) {
  return `link:${absolutePath.split('\\').join('/')}`
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporary, path)
}

/** Кандидаты на pnpm внутри установленного приложения DeepSeek Harness. */
function pnpmCandidates() {
  const relative = join('runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs')
  const roots = []
  const scan = (base) => {
    try {
      for (const entry of readdirSync(base)) {
        if (/deepseek/i.test(entry)) roots.push(join(base, entry, 'resources'))
      }
    } catch {
      // Базы нет — обычная ситуация на чужой ОС.
    }
  }
  if (platform() === 'darwin') {
    roots.push('/Applications/DeepSeek Harness.app/Contents/Resources')
    roots.push(join(homedir(), 'Applications', 'DeepSeek Harness.app', 'Contents', 'Resources'))
  } else if (platform() === 'win32') {
    const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    const programs = process.env.PROGRAMFILES || 'C:\\Program Files'
    roots.push(join(local, 'Programs', 'DeepSeek Harness', 'resources'))
    roots.push(join(programs, 'DeepSeek Harness', 'resources'))
    scan(join(local, 'Programs'))
    scan(programs)
  } else {
    roots.push('/opt/DeepSeek Harness/resources')
    roots.push('/usr/lib/deepseek-harness/resources')
  }
  return roots.map((root) => join(root, relative))
}

function findPnpm(options) {
  if (options.pnpm) {
    if (!existsSync(options.pnpm)) throw new Error(`pnpm не найден по пути ${options.pnpm}`)
    return { kind: 'file', path: options.pnpm }
  }
  for (const candidate of pnpmCandidates()) {
    if (existsSync(candidate)) return { kind: 'file', path: candidate }
  }
  const which = platform() === 'win32' ? 'where' : 'which'
  const found = spawnSync(which, ['pnpm'], { encoding: 'utf8' })
  const line = (found.stdout || '').split(/\r?\n/).map((value) => value.trim()).find(Boolean)
  if (found.status === 0 && line) return { kind: 'command', path: line }
  return undefined
}

function installWithPnpm(pnpm, profileDir) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const spawnOptions = { cwd: profileDir, encoding: 'utf8', env, maxBuffer: 32 * 1024 * 1024 }
  const result =
    pnpm.kind === 'command'
      ? spawnSync(pnpm.path, ['install'], spawnOptions)
      : spawnSync(process.execPath, [pnpm.path, 'install'], spawnOptions)
  return {
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  }
}


/** Убрать выбранные плагины из профиля: зависимости, bundles и установку. */
function removePlugins(options, catalog) {
  const unknown = options.remove.filter((id) => !catalog.some((plugin) => plugin.id === id))
  if (unknown.length > 0) throw new Error(`Неизвестные плагины: ${unknown.join(', ')} (см. --list)`)

  const profileDir = join(options.dshHome, 'profiles', options.profile)
  const manifestPath = join(profileDir, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`Не найден профиль «${options.profile}»: ${manifestPath}`)

  const manifest = readJson(manifestPath)
  const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : []
  const removed = []
  for (const id of options.remove) {
    const name = catalog.find((plugin) => plugin.id === id).package
    if (manifest.dependencies && Object.hasOwn(manifest.dependencies, name)) {
      delete manifest.dependencies[name]
      removed.push(name)
    }
    const index = bundles.indexOf(name)
    if (index >= 0) bundles.splice(index, 1)
  }

  if (removed.length === 0) {
    console.log(`Плагины уже не установлены: ${options.remove.join(', ')}`)
    return
  }
  if (options.dryRun) {
    console.log(`--dry-run: убрал бы ${removed.join(', ')}. Правка не записана.`)
    return
  }

  const backup = `${manifestPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
  copyFileSync(manifestPath, backup)
  writeJson(manifestPath, manifest)
  console.log(`Убрано: ${removed.join(', ')}`)
  console.log(`Резервная копия манифеста: ${backup}`)

  const pnpm = findPnpm(options)
  if (pnpm === undefined) {
    console.log('pnpm не найден: зависимости из манифеста убраны, но node_modules не пересобран. Перезапустите приложение и, если оно ругнётся, выполните install в профиле вручную.')
    return
  }
  const install = installWithPnpm(pnpm, profileDir)
  if (!install.ok) {
    console.error('Пересборка node_modules не удалась:')
    console.error(install.output.split(/\r?\n/).slice(-20).join('\n'))
    process.exitCode = 1
    return
  }
  for (const name of removed) {
    const linkPath = join(profileDir, 'node_modules', name)
    try {
      if (lstatSync(linkPath).isSymbolicLink()) rmSync(linkPath, { force: true })
    } catch {
      // Ссылки уже нет — нечего убирать.
    }
  }
  console.log('Готово. Перезапустите DeepSeek Harness.')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const catalog = readCatalog()

  if (options.help) {
    console.log('node install.mjs --list | --all | --plugins=id1,id2 | --remove=id1,id2 [--profile=desktop] [--dsh-home=...] [--dry-run]')
    return
  }
  if (options.list) {
    printList(catalog)
    return
  }

  if (options.remove.length > 0) {
    removePlugins(options, catalog)
    return
  }

  const unknown = options.plugins.filter((id) => !catalog.some((plugin) => plugin.id === id))
  if (unknown.length > 0) throw new Error(`Неизвестные плагины: ${unknown.join(', ')} (см. --list)`)

  const chosen = options.all ? catalog : catalog.filter((plugin) => options.plugins.includes(plugin.id))
  if (chosen.length === 0) {
    printList(catalog)
    throw new Error('Не выбрано ни одного плагина: укажите --plugins=... или --all')
  }

  const profileDir = join(options.dshHome, 'profiles', options.profile)
  const manifestPath = join(profileDir, 'package.json')
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Не найден профиль «${options.profile}»: ${manifestPath}\n` +
        'Проверьте, что DeepSeek Harness установлен и хотя бы раз запускался. Путь к домашней папке можно задать через --dsh-home.',
    )
  }

  const manifest = readJson(manifestPath)
  for (const plugin of chosen) {
    const dir = join(REPO, plugin.dir)
    if (!existsSync(join(dir, 'package.json'))) throw new Error(`В репозитории нет плагина ${plugin.id}: ${dir}`)
  }

  const before = JSON.stringify(manifest, null, 2)
  manifest.dependencies = manifest.dependencies || {}
  manifest.dsh = manifest.dsh || {}
  manifest.dsh.profile = manifest.dsh.profile || {}
  const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : (manifest.dsh.profile.bundles = [])

  const added = []
  for (const plugin of chosen) {
    const dir = join(REPO, plugin.dir)
    const name = readJson(join(dir, 'package.json')).name || plugin.package
    const spec = linkSpec(dir)
    if (manifest.dependencies[name] !== spec) {
      manifest.dependencies[name] = spec
      added.push(name)
    }
    if (!bundles.includes(name)) bundles.push(name)
  }

  console.log(`Профиль: ${profileDir}`)
  console.log(`Плагины: ${chosen.map((plugin) => plugin.id).join(', ')}`)
  console.log(added.length > 0 ? `Новые зависимости: ${added.join(', ')}` : 'Зависимости уже прописаны — обновляю установку.')
  if (options.dryRun) {
    console.log('\n--dry-run: package.json не меняю. Итоговый состав:')
    console.log(JSON.stringify({ dependencies: manifest.dependencies, bundles }, null, 2))
    return
  }

  const backup = `${manifestPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
  copyFileSync(manifestPath, backup)
  writeJson(manifestPath, manifest)
  console.log(`Резервная копия манифеста: ${backup}`)

  const pnpm = findPnpm(options)
  if (pnpm === undefined) {
    writeFileSync(manifestPath, `${before}\n`, 'utf8')
    throw new Error(
      'Не нашёл pnpm: ни встроенного в приложение DeepSeek Harness, ни в PATH. Манифест возвращён как был.\n' +
        'Варианты: указать --pnpm=<путь к pnpm.mjs> или поставить плагины через CLI приложения: dsh plugin --profile desktop add link:<папка>.',
    )
  }
  console.log(`Менеджер пакетов: ${pnpm.path}`)

  const install = installWithPnpm(pnpm, profileDir)
  if (!install.ok) {
    writeFileSync(manifestPath, `${before}\n`, 'utf8')
    console.error('\nУстановка не удалась — манифест возвращён как был.')
    console.error(install.output.split(/\r?\n/).slice(-25).join('\n'))
    process.exitCode = 1
    return
  }

  const missing = chosen.filter((plugin) => {
    const name = readJson(join(REPO, plugin.dir, 'package.json')).name || plugin.package
    return !existsSync(join(profileDir, 'node_modules', name))
  })
  if (missing.length > 0) {
    console.error(`\nУстановка прошла, но в node_modules нет: ${missing.map((plugin) => plugin.id).join(', ')}`)
    process.exitCode = 1
    return
  }

  console.log('\nГотово. Дальше:')
  console.log('  1. Полностью закройте и снова откройте DeepSeek Harness — состав плагинов читается на старте.')
  console.log('  2. Если окно осталось открытым, обновите его: Cmd+R на macOS, Ctrl+R на Windows.')
  console.log('  3. Проверьте установленное: см. раздел «Проверка» в INSTALL.md.')
  if (options.json) {
    console.log(
      JSON.stringify({
        installed: chosen.map((plugin) => plugin.id),
        profile: profileDir,
        manifestBackup: backup,
      }),
    )
  }
}

try {
  main()
} catch (error) {
  console.error(`\nОшибка: ${error.message}`)
  process.exitCode = 1
}
