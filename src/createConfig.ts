import fs from 'fs'
import path from 'path'
import { setCertificate } from './cdn'
import { createStore, deleteFile, put } from './oss'
import { log, restartNginx } from './utils'

const CONFIG_PATH = path.join(__dirname, '../config.json')

export type Config = {
  domains: string[]
  commonName: string
  challengeCreateFn: (token: string, keyAuthorization: string) => Promise<void>
  challengeRemoveFn: (token: string, keyAuthorization: string) => Promise<void>
  updateCertificate: (serverCertificate: string, privateKey: string) => Promise<void>
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

const createConfigs = () => {
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
    let challengeCreateFn, challengeRemoveFn, updateCertificate
    if (config.useOSS) {
      if (!config.oss) {
        const msg = '请配置 oss'
        log.error(msg)
        throw new Error(msg)
      }
      const store = createStore(config.oss)

      challengeCreateFn = async (token: string, keyAuthorization: string) => {
        await put(store, `.well-known/acme-challenge/${token}`, Buffer.from(keyAuthorization))
      }

      challengeRemoveFn = async (token: string) => {
        await deleteFile(store, `.well-known/acme-challenge/${token}`)
      }

      updateCertificate = async (serverCertificate: string, privateKey: string) => {
        for (const domain of config.domains) {
          await setCertificate({
            accessKeyId: config.oss.accessKeyId,
            accessKeySecret: config.oss.accessKeySecret,
            domainName: domain,
            serverCertificate,
            privateKey,
          })
        }
      }
    } else {
      if (!config.local) {
        const msg = '请设置 local'
        log.error(msg)
        throw new Error(msg)
      }
      const {
        local: { webRoot, fullchainPath, privkeyPath },
      } = config
      const ACME_PATH = '/.well-known/acme-challenge/'
      const challengRoot = path.join(webRoot, ACME_PATH)
      if (!fs.existsSync(challengRoot)) {
        log.info('创建 challengRoot')
        fs.mkdirSync(challengRoot, { recursive: true })
      }

      challengeCreateFn = async (token: string, keyAuthorization: string) => {
        log.debug(`challengeCreateFn: ${path.join(challengRoot, token)} ${keyAuthorization}`)
        fs.writeFileSync(path.join(challengRoot, token), keyAuthorization, 'utf-8')
      }

      challengeRemoveFn = async (token: string) => {
        fs.rmSync(path.join(challengRoot, token), { force: true })
      }

      updateCertificate = async (serverCertificate: string, privateKey: string) => {
        fs.writeFileSync(privkeyPath, privateKey, 'utf-8')
        fs.writeFileSync(fullchainPath, serverCertificate, 'utf-8')
        await restartNginx()
      }
    }
    return {
      ...config,
      challengeCreateFn,
      challengeRemoveFn,
      updateCertificate,
    } as Config
  })
}

export { createConfigs }
