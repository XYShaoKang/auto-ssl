import fs from 'fs'
import path from 'path'
import { format } from 'date-fns'

import { setCertificate, getCertificateInfoByCertName } from './cdn'
import { createStore, deleteFile, put } from './oss'
import { log, restartNginx } from './utils'

const CONFIG_PATH = path.join(__dirname, '../config.json')

export type Config = {
  domains: string[]
  commonName: string
  challengeCreateFn: (token: string, keyAuthorization: string) => Promise<void>
  challengeRemoveFn: (token: string, keyAuthorization: string) => Promise<void>
  updateCertificate: (serverCertificate: string, privateKey: string) => Promise<void>
  backupCertificate: (ACCOUNT_PATH: string) => Promise<void>
} & (
  | {
      useOSS: true
      oss: {
        region: string
        accessKeyId: string
        accessKeySecret: string
        bucket: string
      }
    }
  | {
      useOSS: false
      local: {
        webRoot: string
        fullchainPath: string
        privkeyPath: string
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
    const { commonName, domains } = config

    let challengeCreateFn, challengeRemoveFn, updateCertificate, backupCertificate
    if (config.useOSS) {
      if (!config.oss) {
        const msg = '请配置 oss'
        log.error(msg)
        throw new Error(msg)
      }

      const { accessKeyId, accessKeySecret } = config.oss
      const store = createStore(config.oss)

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
            certName: domain + new Date().valueOf(),
          })
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
      if (!config.local) {
        const msg = '请设置 local'
        log.error(msg)
        throw new Error(msg)
      }
      const { webRoot, certPath } = config.local
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
