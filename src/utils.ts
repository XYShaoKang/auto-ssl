import util from 'util'
import { exec } from 'child_process'
import tls from 'tls'
import { Logger } from './log'

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
  for (let i = 0; i < 5; i++) {
    await sleep(2000)
    const info = await getCertificate(domain)
    if (info.certificate === certificate) {
      flag = true
      break
    }
  }
  return flag
}

const log = new Logger()

export { log, restartNginx, getCertificate, checkCertificate }
