import fs from 'fs'
import path from 'path'
import { format } from 'date-fns'

import { setCertificate, getCertificateInfoByCertName } from './cdn'
import { createStore, deleteFile, put } from './oss'
import { log, restartNginx, checkCertificate } from './utils'

const CONFIG_PATH = path.join(__dirname, '../config.json')
// 默认的过期时间阈值为 15 天,当过期时间小于 15 天时执行更新操作
const DEFAULT_EXPIRE_TIME_THRESHOLD = 15

export type Config = {
  domains: string[]
  commonName: string
  expireTimeThreshold: number
  challengeCreateFn: (token: string, keyAuthorization: string) => Promise<void>
  challengeRemoveFn: (token: string, keyAuthorization: string) => Promise<void>
  updateCertificate: (serverCertificate: string, privateKey: string) => Promise<void>
  backupCertificate: (ACCOUNT_PATH: string) => Promise<void>
} & (
  | {
      server: {
        useOSS: true
        region: string
        accessKeyId: string
        accessKeySecret: string
        bucket: string
      }
    }
  | {
      server: {
        useOSS: false
        webRoot: string
        certPath: string
      }
    }
)

const createConfigs = (): Config[] => {
  if (!fs.existsSync(CONFIG_PATH)) {
    const msg = '找不到配置'
    log.error(msg)
    throw new Error(msg)
  }

  const configs = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  return configs.map((config: any) => {
    if (!config.commonName) {
      config.commonName = config.domains[0]
    }
    if (!config.expireTimeThreshold) {
      config.expireTimeThreshold = DEFAULT_EXPIRE_TIME_THRESHOLD
    }
    const { commonName, domains } = config

    let challengeCreateFn, challengeRemoveFn, updateCertificate, backupCertificate
    if (config.server.useOSS) {
      const { region, accessKeyId, accessKeySecret, bucket } = config.server
      if (!region || !accessKeyId || !accessKeySecret || !bucket) {
        const msg = '请配置 oss'
        log.error(msg)
        throw new Error(msg)
      }

      const store = createStore({ region, accessKeyId, accessKeySecret, bucket })

      challengeCreateFn = async (token: string, keyAuthorization: string) => {
        await put(store, `.well-known/acme-challenge/${token}`, Buffer.from(keyAuthorization))
      }

      challengeRemoveFn = async (token: string) => {
        await deleteFile(store, `.well-known/acme-challenge/${token}`)
      }

      updateCertificate = async (serverCertificate: string, privateKey: string) => {
        for (const domain of domains) {
          await setCertificate({
            accessKeyId: accessKeyId,
            accessKeySecret: accessKeySecret,
            domainName: domain,
            serverCertificate,
            privateKey,
            certName: 'autossl-' + domain + '-' + format(new Date(), 'yyyyMMdd-HHmmssSSS'),
          })

          // 验证证书是否设置成功
          if (await checkCertificate(domain, serverCertificate.split('\n\n')[0])) {
            log.info(`${domain} 已成功更新证书`)
          } else {
            log.warn(`${domain} 未检测到新安装的证书,请手动检查`)
          }
        }
      }

      backupCertificate = async (ACCOUNT_PATH: string) => {
        const backPath = path.join(ACCOUNT_PATH, 'backup')
        if (!fs.existsSync(backPath)) {
          fs.mkdirSync(backPath, { recursive: true })
        }

        const infos = []
        for (const domain of domains) {
          const { serverCertificate, key } = await getCertificateInfoByCertName({
            accessKeyId,
            accessKeySecret,
            domain,
          })
          infos.push({ serverCertificate, key })
        }
        const file = path.join(backPath, format(new Date(), 'yyyyMMddHHmmssSSS'))
        fs.writeFileSync(file, JSON.stringify(infos, null, 2), 'utf-8')
      }
    } else {
      const { webRoot, certPath } = config.server
      if (!webRoot || !certPath) {
        const msg = '请设置 local'
        log.error(msg)
        throw new Error(msg)
      }

      const ACME_PATH = '/.well-known/acme-challenge/'
      const challengRoot = path.join(webRoot, ACME_PATH)
      if (!fs.existsSync(challengRoot)) {
        log.info('创建 challengRoot')
        fs.mkdirSync(challengRoot, { recursive: true })
      }

      const privateKeyPath = path.join(certPath, `${commonName}.key`),
        certificatePath = path.join(certPath, `${commonName}.pem`)

      challengeCreateFn = async (token: string, keyAuthorization: string) => {
        log.debug(`challengeCreateFn: ${path.join(challengRoot, token)} ${keyAuthorization}`)
        fs.writeFileSync(path.join(challengRoot, token), keyAuthorization, 'utf-8')
      }

      challengeRemoveFn = async (token: string) => {
        fs.rmSync(path.join(challengRoot, token), { force: true })
      }

      updateCertificate = async (serverCertificate: string, privateKey: string) => {
        if (!fs.existsSync(certPath)) {
          fs.mkdirSync(certPath, { recursive: true })
        }

        fs.writeFileSync(privateKeyPath, privateKey, 'utf-8')
        fs.writeFileSync(certificatePath, serverCertificate, 'utf-8')
        await restartNginx()

        // 验证证书是否设置成功
        if (await checkCertificate(commonName, serverCertificate.split('\n\n')[0])) {
          log.info(`${commonName} 已成功更新证书`)
        } else {
          log.warn(`${commonName} 未检测到新安装的证书,请手动检查`)
        }
      }
      backupCertificate = async (ACCOUNT_PATH: string) => {
        const backPath = path.join(ACCOUNT_PATH, 'backup')
        if (!fs.existsSync(backPath)) {
          fs.mkdirSync(backPath, { recursive: true })
        }
        const serverCertificate = fs.readFileSync(certificatePath, 'utf-8')
        const key = fs.readFileSync(privateKeyPath, 'utf-8')
        const file = path.join(backPath, format(new Date(), 'yyyyMMddHHmmssSSS'))
        fs.writeFileSync(file, JSON.stringify({ serverCertificate, key }, null, 2), 'utf-8')
      }
    }
    return {
      ...config,
      challengeCreateFn,
      challengeRemoveFn,
      updateCertificate,
      backupCertificate,
    } as Config
  })
}

export { createConfigs }
