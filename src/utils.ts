import fs from 'fs'
import path from 'path'
import util from 'util'
import { exec } from 'child_process'
import { format } from 'date-fns'
import chalk from 'chalk'
import tls from 'tls'

const execPromise = util.promisify(exec)

async function restartNginx() {
  try {
    await execPromise('systemctl reload nginx')
  } catch (error) {
    log.warn(`重启 nginx 失败,${error}`)
  }
}

/**
 * 获取域名当前的证书信息
 * @param domain 需要获取证书的域名
 * @returns 返回域名当前的证书,证书开始时间以及到期时间
 */
function getCertificate(domain: string): Promise<{ certificate: string; expireTime: Date; startTime: Date }> {
  return new Promise((resolve, reject) => {
    const TIMEOUT = 1500
    const socket = tls.connect({ host: domain, port: 443, servername: domain, rejectUnauthorized: false })
    socket.setTimeout(TIMEOUT)
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate()

      const certificate = `-----BEGIN CERTIFICATE-----
${cert.raw
  .toString('base64')
  .match(/.{1,64}/g)
  ?.join('\n')}
-----END CERTIFICATE-----`

      const result = {
        certificate,
        startTime: new Date(cert.valid_from),
        expireTime: new Date(cert.valid_to),
      }
      log.debug('getCertificate: ' + JSON.stringify(result, null, 2))

      socket.destroy()

      if (!certificate) {
        const msg = 'getCertificate: 获取证书信息失败'
        log.warn(msg)
        reject(msg)
      } else {
        resolve(result)
      }
    })
    // socket.once('close', () => resolve(result))
    socket.once('error', reject)
    socket.once('timeout', () => {
      socket.destroy(new Error(`Timeout after ${TIMEOUT} ms for ${domain}:${443}`))
    })
  })
}

async function sleep(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time)
  })
}

/**
 * 检查域名当前的证书,是否与给定的证书相同
 * @param domain 检查的域名
 * @param certificate 对比的证书
 * @returns 返回检查结果
 */
async function checkCertificate(domain: string, certificate: string) {
  let flag = false
  for (let i = 0; i < 3; i++) {
    await sleep(500 * (i + 1))
    const info = await getCertificate(domain)
    if (info.certificate === certificate) {
      flag = true
      break
    }
  }
  return flag
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

export { log, restartNginx, getCertificate, checkCertificate }
