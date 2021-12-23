import acme, { Authorization } from 'acme-client'
import fs from 'fs'
import path from 'path'
import { readFile } from 'fs/promises'
// eslint-disable-next-line import/no-unresolved
import { Challenge } from 'acme-client/types/rfc8555'

import { getCertificate, log } from './utils'
import { Config, createConfigs } from './initConfig'

/**
 * Function used to satisfy an ACME challenge
 *
 * @param {object} authz Authorization object
 * @param {object} challenge Selected challenge
 * @param {string} keyAuthorization Authorization key
 * @returns {Promise}
 */
async function challengeCreateFn(config: Config, authz: Authorization, challenge: Challenge, keyAuthorization: string) {
  log.debug(JSON.stringify(authz))
  log.debug(JSON.stringify(challenge))
  log.debug(keyAuthorization)

  config.challengeCreateFn(challenge.token, keyAuthorization)
}

/**
 * Function used to remove an ACME challenge response
 *
 * @param {object} authz Authorization object
 * @param {object} challenge Selected challenge
 * @returns {Promise}
 */
async function challengeRemoveFn(config: Config, authz: Authorization, challenge: Challenge, keyAuthorization: string) {
  /* Do something here */
  log.debug(JSON.stringify(authz))
  log.debug(JSON.stringify(challenge))
  log.debug(keyAuthorization)

  config.challengeRemoveFn(challenge.token, keyAuthorization)
}

const DEV = !(process.env.NODE_ENV === 'production')

async function auto(config: Config) {
  const commonName = config.commonName

  const ACCOUNT_PATH = path.join(__dirname, '../account', DEV ? 'staging' : 'production', commonName)
  if (!fs.existsSync(ACCOUNT_PATH)) {
    fs.mkdirSync(ACCOUNT_PATH, { recursive: true })
  }
  let accountKey = null,
    accountUrl = ''
  const accountKeyPath = path.join(ACCOUNT_PATH, './account.key')
  const accountUrlPath = path.join(ACCOUNT_PATH, './accountUrl')
  if (fs.existsSync(accountKeyPath) && fs.existsSync(accountUrlPath)) {
    log.info('使用已有账户')
    accountKey = await readFile(accountKeyPath)
    accountUrl = fs.readFileSync(accountUrlPath, 'utf-8')
  } else {
    log.info('清理旧的账户文件')
    // TODO: 备份老的账户和之前的证书
    fs.rmSync(accountKeyPath, { force: true })
    fs.rmSync(accountUrlPath, { force: true })
    log.info('使用新账户,创建私钥')
    accountKey = await acme.forge.createPrivateKey()
  }

  log.info('初始化客户端')
  const directoryUrl = DEV ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production
  const client = new acme.Client({ directoryUrl, accountKey, accountUrl })

  log.info('创建签名申请')
  const [key, csr] = await acme.forge.createCsr({ commonName, altNames: config.domains })

  log.info('使用自动模式申请证书')
  const cert = await client.auto({
    csr,
    termsOfServiceAgreed: true,
    challengeCreateFn: challengeCreateFn.bind(null, config),
    challengeRemoveFn: challengeRemoveFn.bind(null, config),
  })

  log.info('申请成功')

  log.info('保存账户')
  accountUrl = client.getAccountUrl()
  fs.writeFileSync(accountUrlPath, accountUrl, 'utf-8')
  fs.writeFileSync(accountKeyPath, accountKey, 'utf-8')

  log.info('保存证书')
  log.debug(`CSR:\n${csr.toString()}`)
  log.debug(`Private key:\n${key.toString()}`)
  log.debug(`Certificate:\n${cert.toString()}`)

  fs.writeFileSync(path.join(ACCOUNT_PATH, './domain.csr'), csr.toString(), 'utf-8')
  fs.writeFileSync(path.join(ACCOUNT_PATH, './domain.key'), key.toString(), 'utf-8')
  fs.writeFileSync(path.join(ACCOUNT_PATH, './domain.cer'), cert.toString(), 'utf-8')

  await config.backupCertificate(ACCOUNT_PATH)

  await config.updateCertificate(cert.toString(), key.toString())
}

void (async function () {
  for (const config of createConfigs()) {
    try {
      log.info(`========== start ${config.commonName} ==========`)
      const { expireTime } = await getCertificate(config.commonName)

      const maxTime = config.expireTimeThreshold * 24 * 60 * 60 * 1000
      if (expireTime.valueOf() - new Date().valueOf() > maxTime) continue

      await auto(config)

      log.info(`========== end ${config.commonName} ==========\n`)
    } catch (error) {
      if (error instanceof Error) {
        log.error(`申请 ${config.commonName} 证书出现错误: ${error.message}`)
      } else {
        log.error(`申请 ${config.commonName} 证书出现错误: ${error}`)
      }
    }
  }
})()
