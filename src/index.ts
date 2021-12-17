import acme, { Authorization } from 'acme-client'
import fs from 'fs'
import path from 'path'
import { readFile } from 'fs/promises'
// eslint-disable-next-line import/no-unresolved
import { Challenge } from 'acme-client/types/rfc8555'

import { log } from './utils'
import { Config, createConfigs } from './createConfig'

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

async function auto(config: Config) {
  const domain = config.commonName ?? config.domains[0]

  const ACCOUNT_PATH = path.join(__dirname, './account', domain)
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
    log.info('删除旧的账户文件')
    fs.rmSync(accountKeyPath, { force: true })
    fs.rmSync(accountUrlPath, { force: true })
    log.info('使用新账户,创建私钥')
    accountKey = await acme.forge.createPrivateKey()
    fs.writeFileSync(accountKeyPath, accountKey, 'utf-8')
  }

  log.info('初始化客户端')
  const client = new acme.Client({
    // directoryUrl: acme.directory.letsencrypt.staging,
    directoryUrl: acme.directory.letsencrypt.production,
    accountKey,
    accountUrl,
  })

  /* Create CSR */
  const [key, csr] = await acme.forge.createCsr({
    commonName: domain,
    altNames: config.domains,
  })

  /* Certificate */
  const cert = await client.auto({
    csr,
    termsOfServiceAgreed: true,
    challengeCreateFn: challengeCreateFn.bind(null, config),
    challengeRemoveFn: challengeRemoveFn.bind(null, config),
  })

  accountUrl = client.getAccountUrl()
  fs.writeFileSync(accountUrlPath, accountUrl, 'utf-8')

  /* Done */
  log.debug(`CSR:\n${csr.toString()}`)
  log.debug(`Private key:\n${key.toString()}`)
  log.debug(`Certificate:\n${cert.toString()}`)

  fs.writeFileSync(path.join(ACCOUNT_PATH, './domain.csr'), csr.toString(), 'utf-8')
  fs.writeFileSync(path.join(ACCOUNT_PATH, './domain.key'), key.toString(), 'utf-8')
  fs.writeFileSync(path.join(ACCOUNT_PATH, './domain.cer'), cert.toString(), 'utf-8')

  await config.updateCertificate(cert.toString(), key.toString())
}

void (async function () {
  for (const config of createConfigs()) {
    log.info(`start ${config.domains[0]}`)
    await auto(config)
    log.info(`end ${config.domains[0]}`)
  }
})()
