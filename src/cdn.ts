import Cdn20180510, * as $Cdn20180510 from '@alicloud/cdn20180510'
import * as $OpenApi from '@alicloud/openapi-client'
import { log } from './utils'
import { getCertKey } from './cas'

function createClient(accessKeyId: string, accessKeySecret: string) {
  const config = new $OpenApi.Config({
    accessKeyId: accessKeyId,
    accessKeySecret: accessKeySecret,
  })

  config.endpoint = 'cdn.aliyuncs.com'
  return new Cdn20180510(config)
}

const getCdnClient = (() => {
  const cache = new Map<string, Cdn20180510>()
  return (accessKeyId: string, accessKeySecret: string) => {
    let client = cache.get(accessKeyId)
    if (!client) {
      client = createClient(accessKeyId, accessKeySecret)
      cache.set(accessKeyId, client)
    }
    return client
  }
})()

type Option = {
  accessKeyId: string
  accessKeySecret: string
  domainName: string
  serverCertificate: string
  privateKey: string
}

// https://next.api.aliyun.com/document/Cdn/2018-05-10/SetDomainServerCertificate
async function setCertificate({ accessKeyId, accessKeySecret, domainName, serverCertificate, privateKey }: Option) {
  const client = getCdnClient(accessKeyId, accessKeySecret)
  const request = new $Cdn20180510.SetDomainServerCertificateRequest({
    domainName,
    serverCertificateStatus: 'on',
    certType: 'upload',
    serverCertificate,
    privateKey,
  })

  const response = await client.setDomainServerCertificate(request)
  log.info('CDN: 设置加速域名的证书信息成功')
  log.debug(JSON.stringify(response.body))
}

// https://next.api.aliyun.com/document/Cdn/2018-05-10/DescribeDomainCertificateInfo
async function getCertificateInfoByDomain({
  accessKeyId,
  accessKeySecret,
  domain,
}: {
  accessKeyId: string
  accessKeySecret: string
  domain: string
}): Promise<$Cdn20180510.DescribeDomainCertificateInfoResponseBodyCertInfosCertInfo | undefined> {
  const client = getCdnClient(accessKeyId, accessKeySecret)
  const request = new $Cdn20180510.DescribeDomainCertificateInfoRequest({
    domainName: domain,
  })
  const response = await client.describeDomainCertificateInfo(request)
  log.info('CDN: 获取域名的证书信息成功')
  log.debug(JSON.stringify(response.body))
  return response.body.certInfos?.certInfo?.[0]
}

// https://next.api.aliyun.com/document/Cdn/2018-05-10/DescribeCdnCertificateDetail
async function getCertificateInfoByCertName({
  accessKeyId,
  accessKeySecret,
  domain,
}: {
  accessKeyId: string
  accessKeySecret: string
  domain: string
}) {
  const info = await getCertificateInfoByDomain({
    accessKeyId,
    accessKeySecret,
    domain,
  })

  if (!info) {
    const msg = 'CDN: 通过域名获取证书失败'
    log.error(msg)
    throw new Error(msg)
  }

  const client = getCdnClient(accessKeyId, accessKeySecret)
  const request = new $Cdn20180510.DescribeCdnCertificateDetailRequest({
    certName: info.certName,
  })

  const response = await client.describeCdnCertificateDetail(request)
  const certId = response.body.certId

  log.info('CDN: 获取 certId 成功')
  log.debug(JSON.stringify(response.body))

  let key = ''

  if (certId) {
    // https://next.api.aliyun.com/document/Cdn/2018-05-10/DescribeCdnCertificateDetail
    // https://next.api.aliyun.com/document/cas/2018-07-13/DescribeUserCertificateDetail
    // 在 DescribeCdnCertificateDetail 这个 API 的说明中,返回值是包含 key 的,只是实际的返回值中却没有,所以需要另外通过证书服务的 API 去获取 key,这样当证书安装失败时,需要还原原先的证书,就有完整的信息

    try {
      const { body } = await getCertKey(accessKeyId, accessKeySecret, certId)

      key = body.key ?? ''
    } catch (error) {
      if (error instanceof Error) {
        log.warn(error.message)
      }
    }
  }

  return { ...info, key }
}

export { setCertificate, getCertificateInfoByDomain, getCertificateInfoByCertName }
