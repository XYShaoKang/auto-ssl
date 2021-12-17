import fs from 'fs'
import path from 'path'
import util from 'util'
import { exec } from 'child_process'
import { format } from 'date-fns'
import chalk from 'chalk'

const execPromise = util.promisify(exec)

async function restartNginx() {
  try {
    await execPromise('systemctl restart nginx')
  } catch (error) {
    log.warn(`重启 nginx 失败,${error}`)
  }
}

const LevelMap = ['DEBUG', 'INFO', 'WARN', 'ERROR']

enum Level {
  Debug,
  Info,
  Warn,
  Error,
}

const colorMap = {
  [Level.Debug]: chalk.gray,
  [Level.Info]: chalk.blue,
  [Level.Warn]: chalk.yellow,
  [Level.Error]: chalk.red,
}

class Logger {
  private handles: {
    minLevel: Level
    handle: (level: Level, msg: string) => void
  }[] = []
  constructor() {
    const logRoot = path.join(__dirname, '../log')
    if (!fs.existsSync(logRoot)) {
      fs.mkdirSync(logRoot)
    }

    this.handles.push(
      {
        minLevel: Level.Info,
        handle: (level: Level, msg: string) => console.log(colorMap[level](msg)),
      },
      {
        minLevel: Level.Debug,
        handle: (level: Level, msg: string) => {
          fs.appendFileSync(path.join(logRoot, './auto-ssl.log'), msg + '\n')
        },
      },
    )
  }

  private log(level: Level, msg: string) {
    const time = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx")
    const message = `${`[${LevelMap[level]}]`.padEnd(7, ' ')} ${time}: ${msg}`
    for (const { minLevel, handle } of this.handles) {
      if (level >= minLevel) {
        handle(level, message)
      }
    }
  }

  debug(msg: string) {
    this.log(Level.Debug, msg)
  }
  info(msg: string) {
    this.log(Level.Info, msg)
  }
  warn(msg: string) {
    this.log(Level.Warn, msg)
  }
  error(msg: string) {
    this.log(Level.Error, msg)
  }
}

const log = new Logger()

export { log, restartNginx }
